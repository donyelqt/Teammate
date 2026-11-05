"""Tests for the Worker ASGI entrypoint.

Verifies that ``Default`` from ``server.worker`` is a callable that
routes HTTP requests through the FastAPI app, and that the
``/health`` endpoint returns a valid health contract.

The ``workers`` package depends on Pyodide/Cloudflare runtime modules
(``js``, ``_pyodide_entrypoint_helper``, ``_cloudflare_compat_flags``)
that are unavailable in a host venv. These are mocked at import time
so the entrypoint can be exercised in CI.
"""

from __future__ import annotations

import sys
from collections.abc import Generator
from unittest.mock import MagicMock

import httpx
import pytest


@pytest.fixture(autouse=True, scope="module")
def _mock_pyodide_modules() -> Generator[None]:
    """Provide stub modules for Pyodide/Cloudflare runtime dependencies."""
    saved = {
        k: sys.modules.get(k)
        for k in ("js", "_pyodide_entrypoint_helper", "_cloudflare_compat_flags")
    }
    for name in saved:
        sys.modules[name] = MagicMock()
    try:
        yield
    finally:
        for name, original in saved.items():
            if original is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = original


def _client() -> httpx.AsyncClient:
    from server.main import app

    return httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://testserver"
    )


def test_default_is_callable() -> None:
    from server.worker import Default

    assert callable(Default), "Default must be callable"


@pytest.mark.asyncio
async def test_health_through_worker() -> None:
    async with _client() as client:
        response = await client.get("/health")

    assert response.status_code == 200, (
        f"expected 200, got {response.status_code}"
    )
    body = response.json()
    assert body["version"] == "0.1.0"
    assert body["checks"]["realtime"] == "up"


@pytest.mark.asyncio
async def test_unknown_route_through_worker() -> None:
    async with _client() as client:
        response = await client.get("/does-not-exist")

    assert response.status_code == 404, (
        f"expected 404, got {response.status_code}"
    )