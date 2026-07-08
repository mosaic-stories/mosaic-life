# Verification Notes

## 2026-07-08

- Targeted backend slice passed:
  `uv run pytest tests/test_access_matrix.py tests/test_legacy_service.py tests/test_legacy_api.py tests/test_story_service.py tests/test_story_sharing.py tests/services/test_retrieval.py tests/test_retrieval_shared.py tests/services/test_graph_access_filter.py`
  Result: 135 passed.
- Full backend suite passed:
  `uv run pytest`
  Result: 1255 passed, 2 skipped.
- Backend validation passed:
  `just validate-backend`
  Result: ruff lint passed, ruff format check passed, mypy passed.
- After consolidating `get_shared_story_ids` onto the shared linked-legacy helper, the focused access/sharing/retrieval slice was rerun:
  `uv run pytest tests/test_access_matrix.py tests/test_story_sharing.py tests/test_retrieval_shared.py tests/services/test_retrieval.py tests/services/test_graph_access_filter.py`
  Result: 67 passed.
- Backend validation was rerun after that helper consolidation:
  `just validate-backend`
  Result: passed.
- Host frontend validation was blocked because `apps/web/node_modules` did not contain `eslint` (`npm ls eslint --depth=0` returned empty). Frontend validation was run in the active compose web container instead:
  - `docker compose -f infra/compose/docker-compose.yml exec -T web npm run lint`
  - `docker compose -f infra/compose/docker-compose.yml exec -T web npx tsc --noEmit`
  Result: both passed.

### Migration Rehearsal

Compose Postgres was running and Alembic started at `b5d7e8f9a0c1`.

Seeded temporary non-canonical rows:

- `legacy_members.role='member'`
- `legacy_members.role='editor'`
- `legacy_members.role='pending'`

Applied migration:

`DB_URL=postgresql+psycopg://postgres:postgres@localhost:25432/mosaic uv run alembic upgrade head`

Observed cleanup output:

`canonical access cleanup: member_to_advocate=1, editor_to_admin=1, pending_deleted=1`

Constraint rejection check:

`INSERT INTO legacy_members ... role='pending'`

Observed:

`violates check constraint "ck_legacy_members_role_canonical"`

Rollback rehearsal:

- `uv run alembic downgrade -1` succeeded.
- `uv run alembic upgrade head` succeeded again, with cleanup counts `0`.

Temporary rehearsal users/person/legacy were deleted after the rehearsal.

### Manual End-to-End Verification

Manual validation completed by owner on 2026-07-08 for task 6.1:

- Admirer, advocate, and non-member story visibility in a private legacy matched the decided matrix in UI and API.
- Link-shared story detail access worked for a member of the receiving legacy and was denied after revocation.
- Draft story detail returned 404 to another member.
- `POST /api/legacies/{id}/join` returned 404.
- Access-request to approve to membership flow worked from the UI.
- `authz_decisions_total` was visible on `/metrics`, and `authz.can_read_story` spans were visible in Jaeger.
