"""Contract tests for the health endpoint.

Named for the observable behavior: a process that is up answers 200 with a
status body. If ASGI routing breaks, this is the surface that catches it before
the Worker deploy does.
"""

from fastapi.testclient import TestClient

from server.main import app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_unknown_route_returns_404() -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404
