"""Simple circuit breaker for external service calls."""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)


class CircuitBreaker:
    """Three-state circuit breaker: closed → open → half_open → closed.

    - **closed**: normal operation.
    - **open**: all requests are rejected (returns False from allow_request).
    - **half_open**: one trial request is allowed.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        recovery_timeout: float = 30.0,
    ) -> None:
        self._failure_threshold = failure_threshold
        self._recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._state = "closed"
        self._last_failure_time: float = 0.0

    @property
    def state(self) -> str:
        return self._state

    def allow_request(self) -> bool:
        """Return True if the request should proceed."""
        if self._state == "closed":
            return True
        if self._state == "open":
            if time.monotonic() - self._last_failure_time >= self._recovery_timeout:
                self._state = "half_open"
                logger.info("circuit_breaker.half_open")
                return True
            return False
        # half_open — allow one trial
        return True

    def record_success(self) -> None:
        """Record a successful call."""
        if self._state in ("half_open", "closed"):
            self._failure_count = 0
            self._state = "closed"

    def record_failure(self) -> None:
        """Record a failed call."""
        self._failure_count += 1
        self._last_failure_time = time.monotonic()

        if self._state == "half_open":
            self._state = "open"
            logger.warning("circuit_breaker.reopened")
        elif self._failure_count >= self._failure_threshold:
            self._state = "open"
            logger.warning(
                "circuit_breaker.opened",
                extra={"failures": self._failure_count},
            )
