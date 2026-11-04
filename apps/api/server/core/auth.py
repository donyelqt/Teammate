"""Authentication dependency.

Verifies the `Authorization: Bearer <token>` header against the Supabase JWT
secret and returns the authenticated user's id. Supabase access tokens are
HS256-signed with the project's `JWT_SECRET`; the claim that gates RLS is
`sub`, so that is the only field we need.

Falling back to a Supabase auth call would add a network round-trip per
request and a second failure mode (the auth service down) on top of the one
we already have to report. The secret is local.
"""

from __future__ import annotations

import logging
import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

log = logging.getLogger("teammate.auth")

_bearer_scheme = HTTPBearer(auto_error=False)


class AuthUser:
    """An authenticated request principal."""

    __slots__ = ("id",)

    def __init__(self, id: uuid.UUID) -> None:
        self.id = id

    def __eq__(self, other: object) -> bool:
        return isinstance(other, AuthUser) and other.id == self.id

    def __hash__(self) -> int:
        return hash(self.id)


def _verify_token(token: str) -> uuid.UUID:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired.",
        )
    except jwt.PyJWTError as exc:
        log.debug("JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token.",
        )

    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim.",
        )
    try:
        return uuid.UUID(sub)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject is not a UUID.",
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthUser:
    """Require a valid bearer token. 401 on missing or invalid token."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
        )
    return AuthUser(_verify_token(credentials.credentials))


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> AuthUser | None:
    """Like `get_current_user` but returns None instead of raising."""
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    try:
        return AuthUser(_verify_token(credentials.credentials))
    except HTTPException:
        return None


__all__ = ["AuthUser", "get_current_user", "get_optional_user"]