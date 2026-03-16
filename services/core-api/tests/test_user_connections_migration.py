"""Regression tests for the user connections migration."""

from pathlib import Path


def test_migration_does_not_use_postgres_cast_on_named_binds() -> None:
    """The migration must avoid :param::json-style casts that break SQLAlchemy binding."""
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "c10b9be6ac3d_add_user_connections_profiles_and_.py"
    )
    migration_source = migration_path.read_text(encoding="utf-8")

    assert ":nicknames::json" not in migration_source
    assert ":traits::json" not in migration_source
