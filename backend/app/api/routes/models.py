"""
ModelMesh Backend  Model Routes
GET  /models                List marketplace models (no auth)
POST /models                Create model metadata (auth required)
POST /models/publish        Upload weights †’ Pinata †’ create model + version (auth)
GET  /base-models           List seeded base model architectures (no auth)
GET  /models/{id}           Get single model with versions
DELETE /models/{id}         Delete model (owner only)
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query, UploadFile, File, Form
from datetime import datetime, timezone
from bson import ObjectId
from typing import Optional, List

from app.models.schemas import ModelCreate, ModelOut, BaseModelOut
from app.core.database import (
    get_models_collection, get_users_collection,
    get_versions_collection, get_base_models_collection, BASE_MODELS,
)
from app.core.security import get_current_user
from app.services.storage_service import upload_file_to_pinata, get_gateway_url

router=APIRouter(tags=["Models"])

ALLOWED_WEIGHT_EXTS={".pt", ".pth", ".onnx", ".h5", ".bin", ".safetensors", ".pkl"}



async def _resolve_arch_name(base_model_id: str) -> str:
    """Return human-readable name for a base_model_id."""
    col=get_base_models_collection()
    doc=await col.find_one({"id": base_model_id})
    return doc["name"] if doc else base_model_id


async def _enrich_model(doc: dict, users_col) -> ModelOut:
    owner=await users_col.find_one({"_id": ObjectId(doc["owner_id"])}) if ObjectId.is_valid(doc.get("owner_id", "")) else None
    owner_username=owner.get("username", "unknown") if owner else "unknown"
    cid=doc.get("current_version_cid")
    return ModelOut(
        id=str(doc["_id"]),
        original_model_id=doc.get("original_model_id", str(doc["_id"])),
        name=doc["name"],
        description=doc.get("description", ""),
        base_model_id=doc.get("base_model_id", "custom"),
        architecture_type=doc.get("architecture_type", doc.get("base_model_id", "custom")),
        tags=doc.get("tags", []),
        input_shape=doc.get("input_shape", []),
        current_version_cid=cid,
        pinata_gateway_url=get_gateway_url(cid) if cid else None,
        owner_id=doc["owner_id"],
        owner_username=owner_username,
        is_public=doc.get("is_public", True),
        download_count=doc.get("download_count", 0),
        created_at=doc["created_at"],
        updated_at=doc["updated_at"],
    )



@router.get("/base-models", response_model=List[BaseModelOut])
async def list_base_models():
    """Return the full catalogue of supported base model architectures."""
    col=get_base_models_collection()
    docs=await col.find({}).sort("family", 1).to_list(length=200)
    if not docs:
        return [BaseModelOut(**entry) for entry in BASE_MODELS]
    return [BaseModelOut(**{k: v for k, v in doc.items() if k!="_id"}) for doc in docs]


@router.get("/base-models/catalogue", response_model=List[ModelOut])
async def list_base_models_catalogue():
    """Return base models formatted as ModelOut objects for the marketplace."""
    col=get_base_models_collection()
    docs=await col.find({}).sort("family", 1).to_list(length=200)
    if not docs:
        docs=BASE_MODELS
    now=datetime.now(timezone.utc)
    res=[]
    for doc in docs:
        res.append(ModelOut(
            id=doc["id"],
            original_model_id=doc["id"],
            name=f"{doc['name']} (Base)",
            description=doc.get("description", "Base architecture for custom fine-tuning."),
            base_model_id=doc["id"],
            architecture_type=doc["name"],
            tags=["base-model", doc["family"]],
            input_shape=doc.get("input_shape", []),
            current_version_cid=None,
            pinata_gateway_url=None,
            owner_id="system",
            owner_username="AetherNet",
            is_public=True,
            is_base_model=True,
            download_count=0,
            created_at=now,
            updated_at=now,
        ))
    return res



@router.get("/models", response_model=List[ModelOut])
async def list_models(
    page: int=Query(1, ge=1),
    limit: int=Query(20, ge=1, le=100),
    family: Optional[str]=None,
    base_model_id: Optional[str]=None,
    search: Optional[str]=None,
):
    """List public marketplace models. No authentication required."""
    models_col=get_models_collection()
    users_col=get_users_collection()

    query: dict={"is_public": True}
    if family:
        query["family"]=family
    if base_model_id:
        query["base_model_id"]=base_model_id
    if search:
        query["$or"]=[
            {"name":        {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}},
            {"tags":        {"$in":    [search]}},
        ]

    skip=(page - 1)*limit
    cursor=models_col.find(query).sort("created_at", -1).skip(skip).limit(limit)
    docs=await cursor.to_list(length=limit)
    return [await _enrich_model(doc, users_col) for doc in docs]



@router.post("/models/publish", response_model=ModelOut, status_code=status.HTTP_201_CREATED)
async def publish_model(
    weights:       UploadFile=File(...,     description="Model weights (.pt, .pth, .onnx, .h5, .bin, .safetensors)"),
    name:          str=Form(...,     min_length=1, max_length=120),
    description:   str=Form("",     max_length=2000),
    base_model_id: str=Form("custom"),
    tags:          str=Form("",     description="Comma-separated tags"),
    is_public:     bool=Form(True),
    current_user: dict=Depends(get_current_user),
):
    """
    Upload model weights to Pinata IPFS, then create a Model + Version document.
    Accepts multipart/form-data.
    """
    import os
    _, ext=os.path.splitext(weights.filename or "")
    if ext.lower() not in ALLOWED_WEIGHT_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_WEIGHT_EXTS)}",
        )

    arch_name=await _resolve_arch_name(base_model_id)

    file_bytes=await weights.read()
    cid=await upload_file_to_pinata(file_bytes, weights.filename or "weights")
    gateway_url = get_gateway_url(cid)

    models_col=get_models_collection()
    versions_col=get_versions_collection()
    users_col=get_users_collection()
    now=datetime.now(timezone.utc)

    model_oid=ObjectId()
    model_id_str=str(model_oid)
    owner_id_str=str(current_user.get("_id", current_user.get("clerk_user_id", "")))
    tag_list=[t.strip() for t in tags.split(",") if t.strip()]

    model_doc={
        "_id":              model_oid,
        "original_model_id": model_id_str,
        "name":             name,
        "description":      description,
        "base_model_id":    base_model_id,
        "architecture_type": arch_name,
        "family":           (await get_base_models_collection().find_one({"id": base_model_id}) or {}).get("family", "custom"),
        "tags":             tag_list,
        "input_shape":      [],
        "current_version_cid": cid,
        "owner_id":         owner_id_str,
        "is_public":        is_public,
        "download_count":   0,
        "created_at":       now,
        "updated_at":       now,
    }
    await models_col.insert_one(model_doc)

    version_count=await versions_col.count_documents({"parent_id": model_id_str})
    version_doc={
        "parent_id":      model_id_str,
        "new_cid":        cid,
        "session_key":    None,
        "metrics_json":   {},
        "notes":          f"Initial upload  {weights.filename}",
        "version_number": version_count + 1,
        "pinned_by":      owner_id_str,
        "timestamp":      now,
    }
    await versions_col.insert_one(version_doc)

    return await _enrich_model(model_doc, users_col)



@router.post("/models", response_model=ModelOut, status_code=status.HTTP_201_CREATED)
async def create_model(
    payload: ModelCreate,
    current_user: dict=Depends(get_current_user),
):
    """Create a model record with no weight upload (CID can be added later via /versions/upload)."""
    models_col=get_models_collection()
    users_col=get_users_collection()
    now=datetime.now(timezone.utc)
    arch_name=await _resolve_arch_name(payload.base_model_id)

    model_oid=ObjectId()
    model_id_str=str(model_oid)
    owner_id_str=str(current_user.get("_id", current_user.get("clerk_user_id", "")))

    doc={
        "_id":               model_oid,
        "original_model_id": model_id_str,
        "name":              payload.name,
        "description":       payload.description,
        "base_model_id":     payload.base_model_id,
        "architecture_type": arch_name,
        "family":            (await get_base_models_collection().find_one({"id": payload.base_model_id}) or {}).get("family", "custom"),
        "tags":              payload.tags,
        "input_shape":       payload.input_shape,
        "current_version_cid": None,
        "owner_id":          owner_id_str,
        "is_public":         payload.is_public,
        "download_count":    0,
        "created_at":        now,
        "updated_at":        now,
    }
    await models_col.insert_one(doc)
    return await _enrich_model(doc, users_col)



@router.get("/models/{model_id}", response_model=ModelOut)
async def get_model(model_id: str):
    models_col=get_models_collection()
    users_col=get_users_collection()
    try:
        oid=ObjectId(model_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid model ID format")

    doc=await models_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Model not found")
    return await _enrich_model(doc, users_col)



@router.delete("/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: str,
    current_user: dict=Depends(get_current_user),
):
    models_col=get_models_collection()
    try:
        oid=ObjectId(model_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid model ID")
    doc=await models_col.find_one({"_id": oid})
    if not doc:
        raise HTTPException(status_code=404, detail="Model not found")
    owner_id_str=str(current_user.get("_id", current_user.get("clerk_user_id", "")))
    if doc["owner_id"]!=owner_id_str:
        raise HTTPException(status_code=403, detail="Not the model owner")
    await models_col.delete_one({"_id": oid})
