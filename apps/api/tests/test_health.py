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

    body = response.json()
    assert body["version"] == "0.1.0"
    assert body["checks"]["realtime"] == "up"
    assert body["status"] == "ok"
    assert response.status_code == 200


def test_unknown_route_returns_404() -> None:
    response = client.get("/does-not-exist")

    assert response.status_code == 404