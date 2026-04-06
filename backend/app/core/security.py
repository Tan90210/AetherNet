"""
AetherNet Backend  Security Utilities (Clerk Edition)
All auth is handled by Clerk. This module:
  1. Verifies incoming Bearer tokens against Clerk's JWKS endpoint.
  2. Provides a FastAPI dependency (get_current_user) that resolves
     the MongoDB user document from the Clerk JWT claims.
"""

import os
import logging
from functools import lru_cache
from datetime import datetime, timezone
import jwt
from jwt import PyJWKClient, ExpiredSignatureError, InvalidTokenError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import get_settings
from app.core.database import get_users_collection

logger=logging.getLogger(__name__)
settings=get_settings()
bearer_scheme=HTTPBearer(auto_error=False)


@lru_cache(maxsize=1)
def _get_jwks_client() -> PyJWKClient:
    """Return a cached JWKS client pointing at Clerk's key endpoint."""
    clean_domain = settings.clerk_frontend_api.replace("https://", "").strip("/")
    jwks_url = f"https://{clean_domain}/.well-known/jwks.json"
    logger.info("Initializing JWKS client: %s", jwks_url)
    return PyJWKClient(jwks_url, cache_keys=True)


def verify_clerk_token(token: str) -> dict:
    """
    Verify a Clerk-issued JWT and return its decoded payload.
    Raises HTTPException 401 on any failure.
    """
    try:
        jwks_client=_get_jwks_client()
        signing_key=jwks_client.get_signing_key_from_jwt(token)
        payload=jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            leeway=300,
            options={"verify_exp": True},
        )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid token: {exc}")
    except Exception as exc:
        logger.exception("JWKS verification error")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")



async def get_current_user(
    credentials: HTTPAuthorizationCredentials=Depends(bearer_scheme),
) -> dict:
    """
    FastAPI dependency  resolves the current MongoDB user from a Clerk JWT.

    Flow:
      1. Verify JWT via Clerk JWKS.
      2. Extract clerk_user_id from `sub` claim.
      3. Look up/auto-upsert user in MongoDB (sync happens on first call).
    """
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload=verify_clerk_token(credentials.credentials)
    clerk_user_id=payload.get("sub")

    if not clerk_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token: missing sub")

    users_col=get_users_collection()
    user=await users_col.find_one({"clerk_user_id": clerk_user_id})

    if not user:
        raw_email=(payload.get("email") or "").strip().lower()
        email=raw_email or f"{clerk_user_id}@clerk.local"
        base_username=(
            payload.get("username")
            or payload.get("preferred_username")
            or (email.split("@")[0] if email else "user")
        )
        username=f"{base_username}_{clerk_user_id[:8]}"
        now=datetime.now(timezone.utc)

        user=await users_col.find_one_and_update(
            {"clerk_user_id": clerk_user_id},
            {
                "$setOnInsert": {
                    "created_at": now,
                    "username": username,
                    "email": email,
                },
                "$set": {
                    "updated_at": now,
                },
            },
            upsert=True,
            return_document=True,
        )

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to initialize user profile.",
            )

    return user
