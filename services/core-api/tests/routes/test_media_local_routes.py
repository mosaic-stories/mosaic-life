"""Tests for the local-storage media routes (dev-only upload/serve).

Covers security-hardening-104 findings 12a: these routes previously had no
auth check, and their path-traversal guard used a weak string-prefix
comparison that a sibling directory sharing a name prefix (e.g.
"media-evil" vs "media") could bypass.
"""

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.config import Settings
from app.routes import media as media_routes


def _local_settings(base_path: Path) -> Settings:
    return Settings(storage_backend="local", local_media_path=str(base_path))


def _deny_auth(_request: object) -> None:
    raise HTTPException(status_code=401, detail="Not authenticated")


def _allow_auth(_request: object) -> SimpleNamespace:
    return SimpleNamespace(user_id="test-user")


class TestUploadLocalFileAuth:
    """Unauthenticated requests must be rejected before touching disk."""

    @pytest.mark.asyncio
    async def test_rejects_unauthenticated_upload(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        monkeypatch.setattr(
            media_routes, "get_settings", lambda: _local_settings(tmp_path / "media")
        )
        monkeypatch.setattr(media_routes, "require_auth", _deny_auth)

        request = SimpleNamespace()

        with pytest.raises(HTTPException) as exc:
            await media_routes.upload_local_file(path="photo.jpg", request=request)

        assert exc.value.status_code == 401
        # Nothing should have been written to disk.
        assert not (tmp_path / "media" / "photo.jpg").exists()


class TestServeLocalFileAuth:
    """Unauthenticated requests must be rejected before serving a file."""

    @pytest.mark.asyncio
    async def test_rejects_unauthenticated_serve(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        base = tmp_path / "media"
        base.mkdir()
        (base / "photo.jpg").write_bytes(b"data")

        monkeypatch.setattr(media_routes, "get_settings", lambda: _local_settings(base))
        monkeypatch.setattr(media_routes, "require_auth", _deny_auth)

        request = SimpleNamespace()

        with pytest.raises(HTTPException) as exc:
            await media_routes.serve_local_file(path="photo.jpg", request=request)

        assert exc.value.status_code == 401


class TestUploadLocalFilePathTraversal:
    """A sibling directory sharing a name prefix must not be reachable."""

    @pytest.mark.asyncio
    async def test_rejects_sibling_directory_sharing_prefix(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        base = tmp_path / "media"
        base.mkdir()

        monkeypatch.setattr(media_routes, "get_settings", lambda: _local_settings(base))
        monkeypatch.setattr(media_routes, "require_auth", _allow_auth)

        request = SimpleNamespace()

        # Resolves to tmp_path/"media-evil/x" — a *different* directory that
        # merely shares the "media" string prefix with the configured base
        # path. The old startswith() check let this through.
        with pytest.raises(HTTPException) as exc:
            await media_routes.upload_local_file(
                path="../media-evil/x", request=request
            )

        assert exc.value.status_code == 400
        assert exc.value.detail == "Invalid path"
        assert not (tmp_path / "media-evil" / "x").exists()


class TestServeLocalFilePathTraversal:
    """A sibling directory sharing a name prefix must not be reachable."""

    @pytest.mark.asyncio
    async def test_rejects_sibling_directory_sharing_prefix(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
    ) -> None:
        base = tmp_path / "media"
        base.mkdir()

        # Plant a file in the sibling directory to prove it would otherwise
        # be servable.
        evil = tmp_path / "media-evil"
        evil.mkdir()
        (evil / "x").write_bytes(b"secret")

        monkeypatch.setattr(media_routes, "get_settings", lambda: _local_settings(base))
        monkeypatch.setattr(media_routes, "require_auth", _allow_auth)

        request = SimpleNamespace()

        with pytest.raises(HTTPException) as exc:
            await media_routes.serve_local_file(path="../media-evil/x", request=request)

        assert exc.value.status_code == 400
        assert exc.value.detail == "Invalid path"
