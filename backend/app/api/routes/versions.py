"""
ModelMesh Backend  Version Routes
GET  /models/{model_id}/versions         List all versions for a model
POST /models/{model_id}/versions/upload  Upload weights file, pin to Pinata, create version
GET  /versions/{version_id}              Get a single version
"""

from fastapi import APIRouter, HTTPException, status, Depends, UploadFile, File, Form
from datetime import datetime, timezone
from bson import ObjectId
from typing import Optional, List
import json

from app.models.schemas import VersionOut
from app.core.database import (
    get_models_collection,
    get_versions_collection,
    get_users_collection,
)
from app.core.security import get_current_user
from app.services.storage_service import upload_file_to_pinata, get_gateway_url

router=APIRouter(prefix="/models/{model_id}/versions", tags=["Versions"])


async def _get_or_404_model(model_id: str):
    models_col=get_models_collection()
    try:
        oid=ObjectId(model_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid model ID")
    doc=await models_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Model not found")
    return doc


def _serialize_version(doc: dict) -> VersionOut:
    cid=doc["new_cid"]
    return VersionOut(
        id=str(doc["_id"]),
        parent_id=doc["parent_id"],
        new_cid=cid,
        pinata_gateway_url=get_gateway_url(cid),
        session_key=doc.get("session_key"),
        metrics_json=doc.get("metrics_json", {}),
        notes=doc.get("notes", ""),
        version_number=doc.get("version_number", 1),
        pinned_by=doc.get("pinned_by", ""),
        timestamp=doc["timestamp"],
    )


@router.get("", response_model=List[VersionOut])
async def list_versions(model_id: str):
    await _get_or_404_model(model_id)
    versions_col=get_versions_collection()
    cursor=versions_col.find({"parent_id": model_id}).sort("timestamp", -1)
    docs=await cursor.to_list(length=100)
    return [_serialize_version(doc) for doc in docs]


@router.post(
    "/upload",
    response_model=VersionOut,
    status_code=status.HTTP_201_CREATED,
)
async def upload_version(
    model_id: str,
    weights_file: UploadFile=File(..., description="Model weights file (.pt, .pkl, .h5, etc.)"),
    session_key: Optional[str]=Form(default=None),
    metrics_json: str=Form(default="{}"),
    notes: str=Form(default=""),
    current_user: dict=Depends(get_current_user),
):
    """
    Upload model weights to Pinata IPFS and record an immutable version entry.
    Any authenticated user can upload a version; the CID is stored in MongoDB.
    """
    model_doc=await _get_or_404_model(model_id)
    versions_col=get_versions_collection()
    models_col=get_models_collection()

    try:
        metrics=json.loads(metrics_json)
    except json.JSONDecodeError:
        metrics={}

    existing_count=await versions_col.count_documents({"parent_id": model_id})

    file_bytes=await weights_file.read()
    cid=await upload_file_to_pinata(
        file_bytes,
        filename=weights_file.filename or f"weights_v{existing_count + 1}.bin",
        metadata={"model_id": model_id, "version": str(existing_count + 1)},
    )

    now=datetime.now(timezone.utc)
    version_doc={
        "parent_id": model_id,
        "new_cid": cid,
        "session_key": session_key,
        "metrics_json": metrics,
        "notes": notes,
        "version_number": existing_count + 1,
        "pinned_by": str(current_user.get("_id", current_user.get("clerk_user_id", ""))),
        "timestamp": now,
    }

    result=await versions_col.insert_one(version_doc)
    version_doc["_id"]=result.inserted_id

    await models_col.update_one(
        {"_id": ObjectId(model_id)},
        {"$set": {"current_version_cid": cid, "updated_at": now}},
    )

    return _serialize_version(version_doc)


@router.get("/{version_id}", response_model=VersionOut)
async def get_version(model_id: str, version_id: str):
    versions_col=get_versions_collection()
    try:
        oid=ObjectId(version_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid version ID")

    doc=await versions_col.find_one({"_id": oid, "parent_id": model_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Version not found")
    return _serialize_version(doc)
