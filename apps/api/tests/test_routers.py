"""Contract tests for the board, card, comment, and activity routes.

Every route gets two tests: a success path (valid auth, valid request -> 200
plus the expected body) and a non-member rejection path (valid auth for a
principal who is not a member of the target workspace -> 403 or 404).

Rejection comes from Postgres RLS, not from Python: the router sets the
caller's `sub` claim on the connection and the policies decide. The tests
assert on the HTTP shape of that decision, so a broken policy fails the test
just as surely as a broken handler would.
"""

from __future__ import annotations

from .conftest import (
    BOARD_ID,
    MEMBER,
    OUTSIDER,
    OWNER,
    WORKSPACE_ID,
    auth_header,
)


# ---------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------
async def test_list_boards_returns_member_boards(client, seeded) -> None:
    response = await client.get("/api/v1/boards", headers=auth_header(OWNER))
    assert response.status_code == 200
    assert any(b["id"] == seeded["board_id"] for b in response.json())


async def test_list_boards_hides_non_member_workspace(client, seeded) -> None:
    response = await client.get("/api/v1/boards", headers=auth_header(OUTSIDER))
    assert response.status_code == 200
    assert response.json() == []


async def test_get_board_succeeds_for_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}", headers=auth_header(MEMBER)
    )
    assert response.status_code == 200
    assert response.json()["id"] == str(BOARD_ID)


async def test_get_board_rejects_non_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}", headers=auth_header(OUTSIDER)
    )
    assert response.status_code == 404


async def test_create_board_succeeds_for_member(client, seeded) -> None:
    response = await client.post(
        "/api/v1/boards",
        headers=auth_header(MEMBER),
        json={"workspace_id": str(WORKSPACE_ID), "name": "New Board"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "New Board"
    assert body["workspace_id"] == str(WORKSPACE_ID)
    assert body["created_by"] == str(MEMBER)


async def test_create_board_rejects_non_member(client, seeded) -> None:
    response = await client.post(
        "/api/v1/boards",
        headers=auth_header(OUTSIDER),
        json={"workspace_id": str(WORKSPACE_ID), "name": "Injected"},
    )
    assert response.status_code == 403


async def test_delete_board_rejects_member(client, seeded) -> None:
    response = await client.delete(
        f"/api/v1/boards/{BOARD_ID}", headers=auth_header(MEMBER)
    )
    assert response.status_code == 403


async def test_delete_board_succeeds_for_owner(client, seeded) -> None:
    create = await client.post(
        "/api/v1/boards",
        headers=auth_header(OWNER),
        json={"workspace_id": str(WORKSPACE_ID), "name": "To Delete"},
    )
    assert create.status_code == 201
    board_id = create.json()["id"]

    response = await client.delete(
        f"/api/v1/boards/{board_id}", headers=auth_header(OWNER)
    )
    assert response.status_code == 204

    gone = await client.get(
        f"/api/v1/boards/{board_id}", headers=auth_header(OWNER)
    )
    assert gone.status_code == 404


# ---------------------------------------------------------------------------
# Cards
# ---------------------------------------------------------------------------
async def test_list_cards_in_board_succeeds_for_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}/cards", headers=auth_header(MEMBER)
    )
    assert response.status_code == 200
    cards = response.json()
    assert any(c["id"] == seeded["card_id"] for c in cards)


async def test_list_cards_in_board_rejects_non_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}/cards", headers=auth_header(OUTSIDER)
    )
    assert response.status_code == 404


async def test_list_cards_in_list_succeeds_for_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}/lists/{seeded['list_id']}/cards",
        headers=auth_header(MEMBER),
    )
    assert response.status_code == 200
    assert any(c["id"] == seeded["card_id"] for c in response.json())


async def test_list_cards_in_list_rejects_non_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}/lists/{seeded['list_id']}/cards",
        headers=auth_header(OUTSIDER),
    )
    assert response.status_code == 404


async def test_create_card_succeeds_for_member(client, seeded) -> None:
    response = await client.post(
        f"/api/v1/boards/{BOARD_ID}/lists/{seeded['list_id']}/cards",
        headers=auth_header(MEMBER),
        json={"title": "New Card"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "New Card"
    assert body["list_id"] == seeded["list_id"]
    assert body["created_by"] == str(MEMBER)


async def test_create_card_rejects_non_member(client, seeded) -> None:
    response = await client.post(
        f"/api/v1/boards/{BOARD_ID}/lists/{seeded['list_id']}/cards",
        headers=auth_header(OUTSIDER),
        json={"title": "Injected"},
    )
    assert response.status_code in (403, 404)


async def test_update_card_succeeds_for_member(client, seeded) -> None:
    response = await client.patch(
        f"/api/v1/cards/{seeded['card_id']}",
        headers=auth_header(MEMBER),
        json={"title": "Renamed"},
    )
    assert response.status_code == 200
    assert response.json()["title"] == "Renamed"


async def test_update_card_rejects_non_member(client, seeded) -> None:
    response = await client.patch(
        f"/api/v1/cards/{seeded['card_id']}",
        headers=auth_header(OUTSIDER),
        json={"title": "Hijacked"},
    )
    assert response.status_code == 404


async def test_delete_card_rejects_non_member(client, seeded) -> None:
    response = await client.delete(
        f"/api/v1/cards/{seeded['card_id']}",
        headers=auth_header(OUTSIDER),
    )
    assert response.status_code == 404


async def test_delete_card_succeeds_for_member(client, seeded) -> None:
    create = await client.post(
        f"/api/v1/boards/{BOARD_ID}/lists/{seeded['list_id']}/cards",
        headers=auth_header(MEMBER),
        json={"title": "To Delete"},
    )
    assert create.status_code == 201
    card_id = create.json()["id"]

    response = await client.delete(
        f"/api/v1/cards/{card_id}", headers=auth_header(MEMBER)
    )
    assert response.status_code == 204


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------
async def test_list_comments_succeeds_for_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/cards/{seeded['card_id']}/comments",
        headers=auth_header(MEMBER),
    )
    assert response.status_code == 200
    comments = response.json()
    assert any(c["id"] == seeded["comment_id"] for c in comments)


async def test_list_comments_rejects_non_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/cards/{seeded['card_id']}/comments",
        headers=auth_header(OUTSIDER),
    )
    assert response.status_code == 404


async def test_create_comment_succeeds_for_member(client, seeded) -> None:
    response = await client.post(
        f"/api/v1/cards/{seeded['card_id']}/comments",
        headers=auth_header(MEMBER),
        json={"body": "A new comment."},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["body"] == "A new comment."
    assert body["author_id"] == str(MEMBER)
    assert body["card_id"] == seeded["card_id"]


async def test_create_comment_rejects_non_member(client, seeded) -> None:
    response = await client.post(
        f"/api/v1/cards/{seeded['card_id']}/comments",
        headers=auth_header(OUTSIDER),
        json={"body": "Injected"},
    )
    assert response.status_code in (403, 404)


async def test_delete_comment_succeeds_for_author(client, seeded) -> None:
    response = await client.delete(
        f"/api/v1/comments/{seeded['comment_id']}",
        headers=auth_header(OWNER),
    )
    assert response.status_code == 204


async def test_delete_comment_rejects_non_member(client, seeded) -> None:
    response = await client.delete(
        f"/api/v1/comments/{seeded['comment_id']}",
        headers=auth_header(OUTSIDER),
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Activity
# ---------------------------------------------------------------------------
async def test_list_activity_succeeds_for_member(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}/activity",
        headers=auth_header(MEMBER),
    )
    assert response.status_code == 200
    events = response.json()
    assert isinstance(events, list)
    assert len(events) <= 50


async def test_list_activity_hides_non_member_events(client, seeded) -> None:
    response = await client.get(
        f"/api/v1/boards/{BOARD_ID}/activity",
        headers=auth_header(OUTSIDER),
    )
    assert response.status_code == 200
    assert response.json() == []


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
async def test_unauthenticated_request_is_rejected(client, seeded) -> None:
    response = await client.get("/api/v1/boards")
    assert response.status_code == 401


async def test_malformed_token_is_rejected(client, seeded) -> None:
    response = await client.get(
        "/api/v1/boards",
        headers={"Authorization": "Bearer not-a-jwt"},
    )
    assert response.status_code == 401
