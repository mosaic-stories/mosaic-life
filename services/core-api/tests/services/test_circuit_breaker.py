"""Tests for circuit breaker."""

from __future__ import annotations

import time

from app.services.circuit_breaker import CircuitBreaker


class TestCircuitBreaker:
    """Test circuit breaker state transitions."""

    def test_starts_closed(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
        assert cb.state == "closed"
        assert cb.allow_request() is True

    def test_opens_after_threshold_failures(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "closed"
        cb.record_failure()
        assert cb.state == "open"
        assert cb.allow_request() is False

    def test_resets_on_success(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=1.0)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        assert cb.state == "closed"
        assert cb._failure_count == 0

    def test_transitions_to_half_open(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        assert cb.state == "open"

        time.sleep(0.15)
        assert cb.allow_request() is True  # transitions to half_open
        assert cb.state == "half_open"

    def test_half_open_success_closes(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.15)
        cb.allow_request()  # half_open
        cb.record_success()
        assert cb.state == "closed"

    def test_half_open_failure_opens(self) -> None:
        cb = CircuitBreaker(failure_threshold=3, recovery_timeout=0.1)
        cb.record_failure()
        cb.record_failure()
        cb.record_failure()
        time.sleep(0.15)
        cb.allow_request()  # half_open
        cb.record_failure()
        assert cb.state == "open"
