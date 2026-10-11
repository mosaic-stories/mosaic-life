#!/bin/sh
# db-copy.sh: copy one database from Aurora to the lean RDS instance and verify it.
#
# Runs inside the `postgres:16-alpine` db-copy ECS task (embedded into the task
# definition command by lib/rds-stack.ts). Destination objects are owned by DST_ROLE.
#
# Env (ECS-injected from secrets):  SRC_HOST SRC_PORT SRC_USER SRC_PASSWORD SRC_DB
#                                   DST_HOST DST_PORT DST_USER DST_PASSWORD
# Env (plain, overridable at run-task time):  DST_DB DST_ROLE
# Optional:  SRC_SSLMODE / DST_SSLMODE (default require)
#
# Quiesce writes on the source first: row counts are compared after the restore.
set -eu

: "${SRC_HOST:?}" "${SRC_USER:?}" "${SRC_PASSWORD:?}" "${SRC_DB:?}"
: "${DST_HOST:?}" "${DST_USER:?}" "${DST_PASSWORD:?}" "${DST_DB:?}" "${DST_ROLE:?}"
SRC_PORT=${SRC_PORT:-5432}
DST_PORT=${DST_PORT:-5432}
SRC_SSLMODE=${SRC_SSLMODE:-require}
DST_SSLMODE=${DST_SSLMODE:-require}

SRC_CONN="host=$SRC_HOST port=$SRC_PORT dbname=$SRC_DB user=$SRC_USER sslmode=$SRC_SSLMODE"
DST_CONN="host=$DST_HOST port=$DST_PORT dbname=$DST_DB user=$DST_USER sslmode=$DST_SSLMODE"
DST_ADMIN_CONN="host=$DST_HOST port=$DST_PORT dbname=postgres user=$DST_USER sslmode=$DST_SSLMODE"
WORK=$(mktemp -d)

src_psql() { PGPASSWORD="$SRC_PASSWORD" psql -X -v ON_ERROR_STOP=1 "$@"; }
dst_psql() { PGPASSWORD="$DST_PASSWORD" psql -X -v ON_ERROR_STOP=1 "$@"; }

echo "== db-copy: $SRC_HOST/$SRC_DB -> $DST_HOST/$DST_DB (role $DST_ROLE)"

# 1. Create the destination database when missing (e.g. a scratch core_copytest).
if [ -z "$(dst_psql "$DST_ADMIN_CONN" -At -c "SELECT 1 FROM pg_database WHERE datname = '$DST_DB'")" ]; then
  echo "== creating database $DST_DB owned by $DST_ROLE"
  dst_psql "$DST_ADMIN_CONN" -c "CREATE DATABASE \"$DST_DB\" OWNER \"$DST_ROLE\""
fi

# 2. Refuse to restore over existing tables.
existing=$(dst_psql "$DST_CONN" -At -c "SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema')")
if [ "$existing" != "0" ]; then
  echo "ERROR: destination $DST_DB already has $existing tables; drop and recreate it first" >&2
  exit 2
fi

# 3. Dump (custom format) and prepare the restore list.
echo "== pg_dump"
PGPASSWORD="$SRC_PASSWORD" pg_dump -Fc --no-owner --no-privileges -f "$WORK/src.dump" "$SRC_CONN"
pg_restore -l "$WORK/src.dump" > "$WORK/toc.list"

# Extensions need privileges the app role lacks: create them as the master, then drop
# the EXTENSION / COMMENT ON EXTENSION entries from the restore list.
for ext in $(grep ' EXTENSION - ' "$WORK/toc.list" | awk '{print $NF}'); do
  echo "== creating extension $ext"
  dst_psql "$DST_CONN" -c "CREATE EXTENSION IF NOT EXISTS \"$ext\""
done
grep -v ' EXTENSION ' "$WORK/toc.list" > "$WORK/restore.list"

# 4. Restore as DST_ROLE so every object is owned by the app role.
echo "== pg_restore"
PGPASSWORD="$DST_PASSWORD" pg_restore --no-owner --no-privileges --role="$DST_ROLE" \
  --exit-on-error -L "$WORK/restore.list" -d "$DST_CONN" "$WORK/src.dump"

# 5. Exact per-table row counts on both sides.
counts() { # $1 conninfo, $2 password
  query=$(PGPASSWORD="$2" psql -X -At "$1" -c "
    SELECT coalesce(string_agg(format('SELECT %L AS t, count(*) AS n FROM %I.%I',
                  table_schema || '.' || table_name, table_schema, table_name),
                  ' UNION ALL ' ORDER BY table_schema, table_name), '')
      FROM information_schema.tables
     WHERE table_type = 'BASE TABLE'
       AND table_schema NOT IN ('pg_catalog', 'information_schema')")
  if [ -n "$query" ]; then
    PGPASSWORD="$2" psql -X -At -F ' ' "$1" -c "SELECT t, n FROM ($query) c ORDER BY t"
  fi
}
counts "$SRC_CONN" "$SRC_PASSWORD" > "$WORK/src.counts"
counts "$DST_CONN" "$DST_PASSWORD" > "$WORK/dst.counts"
echo "== source row counts";      cat "$WORK/src.counts"
echo "== destination row counts"; cat "$WORK/dst.counts"

echo "== vector extension version"
echo "source:      $(src_psql "$SRC_CONN" -At -c "SELECT extversion FROM pg_extension WHERE extname='vector'")"
echo "destination: $(dst_psql "$DST_CONN" -At -c "SELECT extversion FROM pg_extension WHERE extname='vector'")"

if [ ! -s "$WORK/src.counts" ] || ! diff "$WORK/src.counts" "$WORK/dst.counts" > "$WORK/counts.diff"; then
  echo "ERROR: row counts differ (or source has no tables)" >&2
  cat "$WORK/counts.diff" >&2 || true
  exit 1
fi
echo "== OK: $(wc -l < "$WORK/src.counts" | tr -d ' ') tables, row counts match"
