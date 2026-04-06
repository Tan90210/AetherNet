"""
AetherNet Backend  Auth Routes (Clerk Edition)
GET  /auth/me     Return current user's MongoDB profile
POST /auth/sync   Upsert MongoDB user doc from Clerk JWT (called after first sign-in)
"""

from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime, timezone

from app.models.schemas import UserOut
from app.core.database import get_users_collection
from app.core.security import get_current_user, verify_clerk_token, bearer_scheme
from fastapi.security import HTTPAuthorizationCredentials

router=APIRouter(prefix="/auth", tags=["Authentication"])


def _serialize_user(doc: dict) -> UserOut:
    return UserOut(
        id=str(doc["_id"]),
        username=doc.get("username", ""),
        email=doc.get("email", ""),
        created_at=doc.get("created_at", datetime.now(timezone.utc)),
    )


@router.get("/me", response_model=UserOut)
async def me(current_user: dict=Depends(get_current_user)):
    """Return the current authenticated user's profile from MongoDB."""
    return _serialize_user(current_user)


@router.post("/sync", response_model=UserOut, status_code=status.HTTP_200_OK)
async def sync_user(
    credentials: HTTPAuthorizationCredentials=Depends(bearer_scheme),
):
    """
    Upsert a MongoDB user document from a validated Clerk JWT.
    Call this once after the user signs in on the frontend for the first time.
    Subsequent calls are idempotent.
    """
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload=verify_clerk_token(credentials.credentials)
    clerk_user_id=payload.get("sub")
    raw_email=(payload.get("email") or "").strip().lower()
    email=raw_email or f"{clerk_user_id}@clerk.local"
    username=(
        payload.get("username")
        or payload.get("preferred_username")
        or email.split("@")[0]
    )

    if not clerk_user_id:
        raise HTTPException(status_code=400, detail="Token missing 'sub' claim")

    users_col=get_users_collection()
    now=datetime.now(timezone.utc)

    result=await users_col.find_one_and_update(
        {"clerk_user_id": clerk_user_id},
        {
            "$setOnInsert": {"created_at": now},
            "$set": {
                "clerk_user_id": clerk_user_id,
                "username": username,
                "email": email,
                "updated_at": now,
            },
        },
        upsert=True,
        return_document=True,  # motor: True=ReturnDocument.AFTER
    )

    return _serialize_user(result)
