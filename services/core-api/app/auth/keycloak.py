"""Keycloak OIDC client with PKCE support."""

import base64
import hashlib
import logging
import secrets
from typing import Any
from urllib.parse import urlparse

import httpx

from ..config import Settings
from .models import OIDCUser

logger = logging.getLogger(__name__)

# Module-level cache for the OIDC discovery document (stable for the lifetime of the process)
_metadata_cache: dict[str, Any] | None = None


class KeycloakOIDCError(Exception):
    pass


class KeycloakOIDCClient:
    """OIDC client for Keycloak using Authorization Code + PKCE."""

    def __init__(self, settings: Settings) -> None:
        if not settings.keycloak_client_id or not settings.keycloak_client_secret:
            raise ValueError("Keycloak OIDC credentials not configured")
        if not settings.keycloak_discovery_url:
            raise ValueError("KEYCLOAK_DISCOVERY_URL not configured")

        self.client_id = settings.keycloak_client_id
        self.client_secret = settings.keycloak_client_secret
        self.discovery_url = settings.keycloak_discovery_url

        # Parse the public base URL from the discovery URL (e.g. https://keycloak.m5.build-it.xyz)
        parsed = urlparse(self.discovery_url)
        self._public_base_url = f"{parsed.scheme}://{parsed.netloc}"

        # When running inside Docker the public hostname resolves to 127.0.0.1 (the
        # host-side CoreDNS record), which isn't reachable from within the container.
        # KEYCLOAK_INTERNAL_BASE_URL overrides the base for all server-to-server calls
        # (discovery, token exchange, userinfo) so they hit the Keycloak container
        # directly on the Docker-internal network.
        self._internal_base_url = settings.keycloak_internal_base_url

    # ------------------------------------------------------------------
    # PKCE helpers
    # ------------------------------------------------------------------

    @staticmethod
    def generate_pkce_pair() -> tuple[str, str]:
        """Return (code_verifier, code_challenge) for S256 PKCE."""
        verifier = secrets.token_urlsafe(64)
        digest = hashlib.sha256(verifier.encode()).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
        return verifier, challenge

    # ------------------------------------------------------------------
    # Internal routing helpers
    # ------------------------------------------------------------------

    def _to_internal_url(self, url: str) -> str:
        """Swap the public base URL for the internal base URL on server-to-server calls."""
        if self._internal_base_url:
            return url.replace(self._public_base_url, self._internal_base_url, 1)
        return url

    def _forwarding_headers(self) -> dict[str, str]:
        """X-Forwarded-* headers so Keycloak honours KC_HOSTNAME_STRICT when reached
        via the internal URL.  KC_PROXY_HEADERS=xforwarded makes Keycloak trust these."""
        if not self._internal_base_url:
            return {}
        parsed = urlparse(self._public_base_url)
        return {
            "X-Forwarded-Host": parsed.netloc,
            "X-Forwarded-Proto": parsed.scheme,
            "X-Forwarded-Port": str(443 if parsed.scheme == "https" else 80),
        }

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    async def get_metadata(self) -> dict[str, Any]:
        global _metadata_cache
        if _metadata_cache is None:
            fetch_url = self._to_internal_url(self.discovery_url)
            headers = self._forwarding_headers()
            logger.info("keycloak.metadata.fetching", extra={"url": fetch_url})
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get(fetch_url, headers=headers, timeout=10)
                    response.raise_for_status()
                    _metadata_cache = response.json()
                logger.info(
                    "keycloak.metadata.loaded",
                    extra={"issuer": _metadata_cache.get("issuer")},
                )
            except httpx.HTTPError as exc:
                raise KeycloakOIDCError(
                    f"Failed to fetch OIDC discovery document: {exc}"
                ) from exc
        return _metadata_cache

    async def get_authorization_endpoint(self) -> str:
        """Return the public authorization endpoint — the browser visits this directly."""
        meta = await self.get_metadata()
        return str(meta["authorization_endpoint"])

    # ------------------------------------------------------------------
    # Token exchange
    # ------------------------------------------------------------------

    async def exchange_code_for_tokens(
        self,
        code: str,
        redirect_uri: str,
        code_verifier: str,
    ) -> dict[str, Any]:
        meta = await self.get_metadata()
        # Route through internal URL; Keycloak accepts via X-Forwarded-Host
        token_endpoint = self._to_internal_url(meta["token_endpoint"])
        headers = self._forwarding_headers()

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    token_endpoint,
                    headers=headers,
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": redirect_uri,
                        "client_id": self.client_id,
                        "client_secret": self.client_secret,
                        "code_verifier": code_verifier,
                    },
                    timeout=15,
                )
                if response.status_code != 200:
                    logger.error(
                        "keycloak.token_exchange.failed",
                        extra={"status": response.status_code, "body": response.text},
                    )
                    raise KeycloakOIDCError(f"Token exchange failed: {response.text}")
                result: dict[str, Any] = response.json()
                return result
        except httpx.HTTPError as exc:
            raise KeycloakOIDCError(f"HTTP error during token exchange: {exc}") from exc

    # ------------------------------------------------------------------
    # Userinfo
    # ------------------------------------------------------------------

    async def get_user_info(self, access_token: str) -> OIDCUser:
        meta = await self.get_metadata()
        userinfo_endpoint = self._to_internal_url(meta["userinfo_endpoint"])
        headers = {
            **self._forwarding_headers(),
            "Authorization": f"Bearer {access_token}",
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    userinfo_endpoint,
                    headers=headers,
                    timeout=10,
                )
                if response.status_code != 200:
                    logger.error(
                        "keycloak.userinfo.failed",
                        extra={"status": response.status_code, "body": response.text},
                    )
                    raise KeycloakOIDCError(
                        f"Failed to fetch userinfo: {response.text}"
                    )
                data: dict[str, Any] = response.json()
                logger.info(
                    "keycloak.userinfo.received",
                    extra={
                        "sub": data.get("sub"),
                        "email": data.get("email"),
                        "has_picture": "picture" in data,
                    },
                )
                return OIDCUser(**data)
        except httpx.HTTPError as exc:
            raise KeycloakOIDCError(f"HTTP error fetching userinfo: {exc}") from exc


def get_keycloak_client(settings: Settings) -> KeycloakOIDCClient:
    return KeycloakOIDCClient(settings)
