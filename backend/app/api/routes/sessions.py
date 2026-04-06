import logging
"""
ModelMesh Backend  Session Routes
POST /sessions               Create FL session (generates session_key)
GET  /sessions               List sessions
GET  /sessions/{key}         Get session details
"""

import secrets
import threading
import socket
import os
from io import BytesIO
from fastapi import APIRouter, BackgroundTasks, HTTPException, status, Depends
from datetime import datetime, timezone
from bson import ObjectId
from typing import List, Optional
import numpy as np

from app.models.schemas import SessionCreate, SessionOut, SessionStatus, SessionJoin, SessionStart, SessionAccessRequest
from app.core.database import (
    get_sessions_collection,
    get_models_collection,
    get_base_models_collection,
    get_versions_collection,
    get_users_collection,
)
from app.core.security import get_current_user
from app.core.config import get_settings
from app.services.storage_service import upload_file_to_pinata
from fl.pubsub import event_bus

logger=logging.getLogger(__name__)
router=APIRouter(prefix="/sessions", tags=["Sessions"])
settings=get_settings()
_active_fl_servers: dict[str, threading.Thread]={}


def _pick_available_fl_port(base_port: int, host: str="0.0.0.0") -> int:
    """
    Find an available port starting from base_port.

    Uses a connect()-based check instead of bind()-with-SO_REUSEADDR.
    SO_REUSEADDR lets bind() succeed even when a process is actively
    LISTENING on that port, which meant gRPC would then fail to bind.
    connect() succeeds only if something is already listening †’ port busy.
    connect() fails (ECONNREFUSED) †’ port is free.
    """
    check_host="127.0.0.1" if host in ("0.0.0.0", "::", "") else host
    for candidate in range(base_port, base_port + 100):
        probe=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        probe.settimeout(0.05)
        try:
            probe.connect((check_host, candidate))
        except (ConnectionRefusedError, socket.timeout, OSError):
            return candidate
        finally:
            probe.close()

    fallback=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        fallback.bind(("127.0.0.1", 0))
        return int(fallback.getsockname()[1])
    finally:
        fallback.close()


async def _append_training_event(session_key: str, event_type: str, data: dict):
    sessions_col=get_sessions_collection()
    await sessions_col.update_one(
        {"session_key": session_key},
        {
            "$push": {
                "training_events": {
                    "$each": [{
                        "type": event_type,
                        "data": data,
                        "timestamp": datetime.now(timezone.utc),
                    }],
                    "$slice": -300,
                }
            },
            "$set": {"updated_at": datetime.now(timezone.utc)},
        },
    )


async def _get_or_404_session(key: str):
    sessions_col=get_sessions_collection()
    doc=await sessions_col.find_one({"session_key": key})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return doc


async def _get_or_404_session_by_id(session_id: str):
    sessions_col=get_sessions_collection()
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")
    doc=await sessions_col.find_one({"_id": ObjectId(session_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Session not found")
    return doc


async def _serialize_session(doc: dict) -> SessionOut:
    def _parse_dt(value, fallback):
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except Exception:
                return fallback
        return fallback

    def _to_int(value, default):
        try:
            return int(value)
        except Exception:
            return default

    def _normalize_shape(value):
        if isinstance(value, list):
            out=[]
            for v in value:
                try:
                    out.append(int(v))
                except Exception:
                    pass
            return out
        if isinstance(value, str):
            parts=[p.strip() for p in value.split(",") if p.strip()]
            out=[]
            for p in parts:
                try:
                    out.append(int(p))
                except Exception:
                    pass
            return out
        return []

    def _pick_enum(value, allowed, default):
        if value in allowed:
            return value
        if isinstance(value, str):
            lowered=value.lower()
            for a in allowed:
                if str(a).lower()==lowered:
                    return a
        return default

    now=datetime.now(timezone.utc)
    users_col=get_users_collection()
    lead_user_id=str(doc.get("lead_user_id", ""))
    owner=None

    if ObjectId.is_valid(lead_user_id):
        owner=await users_col.find_one({"_id": ObjectId(lead_user_id)})
    elif lead_user_id:
        owner=await users_col.find_one({"clerk_user_id": lead_user_id})

    participants=doc.get("participants", [])
    pending_requests=doc.get("join_requests", [])

    participant_user_ids=[str(p.get("user_id", "")) for p in participants if p.get("user_id")]
    request_user_ids=[str(r.get("user_id", "")) for r in pending_requests if r.get("user_id")]
    all_user_ids=sorted({uid for uid in participant_user_ids + request_user_ids if ObjectId.is_valid(uid)})

    users_by_mongo_id={}
    if all_user_ids:
        user_docs=await users_col.find(
            {"_id": {"$in": [ObjectId(uid) for uid in all_user_ids]}},
            {"_id": 1, "username": 1, "clerk_user_id": 1},
        ).to_list(length=len(all_user_ids))
        users_by_mongo_id={str(u["_id"]): u for u in user_docs}

    participant_usernames=[]
    participant_clerk_user_ids=[]
    for p in participants:
        mongo_id=str(p.get("user_id", ""))
        linked_user=users_by_mongo_id.get(mongo_id)
        username=p.get("username") or (linked_user.get("username") if linked_user else None)
        if username:
            participant_usernames.append(username)
        clerk_id=linked_user.get("clerk_user_id") if linked_user else None
        if clerk_id:
            participant_clerk_user_ids.append(clerk_id)

    participant_usernames=list(dict.fromkeys(participant_usernames))
    participant_clerk_user_ids=list(dict.fromkeys(participant_clerk_user_ids))
    required_input_shape=_normalize_shape(doc.get("required_input_shape", []))
    session_type=_pick_enum(doc.get("session_type", "public"), ["public", "private"], "public")
    validation_policy=_pick_enum(doc.get("validation_policy", "shape_only"), ["shape_only", "gradient_norm"], "shape_only")
    data_family=_pick_enum(
        doc.get("data_family", "vision"),
        ["vision", "vision_transformer", "nlp", "audio", "edge"],
        "vision",
    )
    status_value=_pick_enum(doc.get("status", SessionStatus.open.value), [
        SessionStatus.open.value,
        SessionStatus.training.value,
        SessionStatus.closed.value,
    ], SessionStatus.open.value)
    created_at=_parse_dt(doc.get("created_at"), now)
    updated_at=_parse_dt(doc.get("updated_at"), now)

    return SessionOut(
        id=str(doc["_id"]),
        session_key=doc["session_key"],
        session_name=doc.get("session_name", ""),
        model_id=doc["model_id"],
        lead_user_id=lead_user_id,
        lead_clerk_user_id=(
            owner.get("clerk_user_id") if owner else (lead_user_id if not ObjectId.is_valid(lead_user_id) else None)
        ),
        lead_username=owner["username"] if owner else "unknown",
        required_input_shape=required_input_shape,
        min_clients=_to_int(doc.get("min_clients", 1), 1),
        max_rounds=_to_int(doc.get("max_rounds", 1), 1),
        current_round=_to_int(doc.get("current_round", 0), 0),
        connected_clients=_to_int(doc.get("connected_clients", len(participants)), len(participants)),
        participant_user_ids=participant_user_ids,
        participant_clerk_user_ids=participant_clerk_user_ids,
        participant_usernames=participant_usernames,
        pending_requests=[
            {
                "user_id": r.get("user_id", ""),
                "clerk_user_id": (
                    users_by_mongo_id.get(str(r.get("user_id", "")), {}).get("clerk_user_id")
                    if ObjectId.is_valid(str(r.get("user_id", "")))
                    else None
                ),
                "username": r.get("username", "unknown"),
                "requested_at": _parse_dt(r.get("requested_at"), created_at),
            }
            for r in pending_requests
        ],
        join_open=doc.get("join_open", True),
        description=doc.get("description", ""),
        session_type=session_type,
        validation_policy=validation_policy,
        data_family=data_family,
        training_config=doc.get("training_config"),
        fl_server_port=doc.get("fl_server_port"),
        member_progress=doc.get("member_progress", {}),
        training_events=doc.get("training_events", []),
        invite_token=doc.get("invite_token"),
        status=status_value,
        final_model_cid=doc.get("final_model_cid"),
        created_at=created_at,
        updated_at=updated_at,
    )


async def _publish_session_artifact(session_doc: dict) -> dict:
    sessions_col=get_sessions_collection()
    models_col=get_models_collection()
    versions_col=get_versions_collection()
    base_models_col=get_base_models_collection()
    session_key=str(session_doc.get("session_key", ""))
    artifact_path=session_doc.get("final_model_artifact_path")

    if not artifact_path or not os.path.isfile(artifact_path):
        raise HTTPException(status_code=409, detail="Final training artifact not found. Train session first.")

    now=datetime.now(timezone.utc)
    target_model_id=str(session_doc.get("model_id", ""))
    model_doc=None
    if ObjectId.is_valid(target_model_id):
        model_doc=await models_col.find_one({"_id": ObjectId(target_model_id)})

    if model_doc is None:
        base_id=target_model_id or "custom"
        base_doc=await base_models_col.find_one({"id": base_id})
        arch_name=(base_doc or {}).get("name", base_id)
        family=(base_doc or {}).get("family", "custom")

        new_model_oid=ObjectId()
        new_model_id=str(new_model_oid)
        session_name=str(session_doc.get("session_name") or session_key)
        lead_username=str(session_doc.get("lead_username") or "owner")

        model_doc={
            "_id": new_model_oid,
            "original_model_id": new_model_id,
            "name": f"{session_name} - Trained",
            "description": f"Published FL result from session '{session_name}' by {lead_username}.",
            "base_model_id": base_id,
            "architecture_type": arch_name,
            "family": family,
            "tags": ["federated-learning", "session-trained"],
            "input_shape": session_doc.get("required_input_shape", []),
            "current_version_cid": None,
            "owner_id": str(session_doc.get("lead_user_id", "")),
            "is_public": True,
            "download_count": 0,
            "created_at": now,
            "updated_at": now,
        }
        await models_col.insert_one(model_doc)
        target_model_id=new_model_id
    else:
        target_model_id=str(model_doc["_id"])

    with open(artifact_path, "rb") as fp:
        weights_blob=fp.read()

    tensor_count=0
    try:
        npz=np.load(BytesIO(weights_blob))
        tensor_count=len(npz.files)
    except Exception:
        tensor_count=0

    cid=await upload_file_to_pinata(
        weights_blob,
        filename=os.path.basename(artifact_path),
        metadata={
            "session_key": session_key,
            "model_id": target_model_id,
            "format": "numpy-npz",
        },
    )

    existing_count=await versions_col.count_documents({"parent_id": target_model_id})
    version_doc={
        "parent_id": target_model_id,
        "new_cid": cid,
        "session_key": session_key,
        "metrics_json": {
            "rounds_completed": int(session_doc.get("current_round", 0) or 0),
            "num_tensors": tensor_count,
        },
        "notes": f"Published after FL session {session_key}.",
        "version_number": existing_count + 1,
        "pinned_by": str(session_doc.get("lead_user_id", "")),
        "timestamp": now,
    }
    await versions_col.insert_one(version_doc)
    await models_col.update_one(
        {"_id": ObjectId(target_model_id)},
        {"$set": {"current_version_cid": cid, "updated_at": now}},
    )
    await sessions_col.update_one(
        {"session_key": session_key},
        {"$set": {"final_model_cid": cid, "updated_at": now}},
    )
    await _append_training_event(session_key, "model_published", {
        "model_id": target_model_id,
        "version_number": existing_count + 1,
        "cid": cid,
    })
    await event_bus.publish("model_published", {
        "session_key": session_key,
        "model_id": target_model_id,
        "version_number": existing_count + 1,
        "cid": cid,
    })
    return {
        "model_id": target_model_id,
        "version_number": existing_count + 1,
        "cid": cid,
    }


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreate,
    current_user: dict=Depends(get_current_user),
):
    models_col=get_models_collection()
    base_models_col=get_base_models_collection()

    model=None
    if ObjectId.is_valid(payload.model_id):
        model=await models_col.find_one({"_id": ObjectId(payload.model_id)})
    if not model:
        model=await base_models_col.find_one({"id": payload.model_id})
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    session_key=secrets.token_urlsafe(12)

    invite_token=secrets.token_urlsafe(16) if payload.session_type=="private" else None

    now=datetime.now(timezone.utc)
    sessions_col=get_sessions_collection()
    doc={
        "session_key": session_key,
        "session_name": payload.session_name.strip() if payload.session_name else f"FL Session {session_key[:6]}",
        "model_id": payload.model_id,
        "lead_user_id": str(current_user["_id"]),
        "required_input_shape": payload.required_input_shape,
        "min_clients": payload.min_clients,
        "max_rounds": payload.max_rounds,
        "current_round": 0,
        "connected_clients": 0,
        "description": payload.description,
        "session_type": payload.session_type,
        "validation_policy": payload.validation_policy,
        "data_family": payload.data_family,
        "training_config": payload.training_config.model_dump(),
        "member_progress": {
            (current_user.get("username") or str(current_user.get("_id"))): {
                "status": "joined",
                "rounds_completed": 0,
                "last_update": now,
            }
        },
        "training_events": [],
        "participants": [{
            "user_id": str(current_user["_id"]),
            "username": current_user.get("username", "unknown"),
            "joined_at": now,
        }],
        "join_requests": [],
        "join_open": True,
        "connected_clients": 1,
        "invite_token": invite_token,
        "status": SessionStatus.open.value,
        "created_at": now,
        "updated_at": now,
    }

    result=await sessions_col.insert_one(doc)
    doc["_id"]=result.inserted_id
    await event_bus.publish("session_created", {
        "session_key": session_key,
        "session_name": doc["session_name"],
        "lead_username": current_user.get("username", "unknown"),
        "session_type": payload.session_type,
    })
    return await _serialize_session(doc)


@router.get("", response_model=List[SessionOut])
async def list_sessions(
    status_filter: Optional[str]=None,
    model_id: Optional[str]=None,
):
    sessions_col=get_sessions_collection()
    query: dict={"$or": [{"session_type": "public"}, {"session_type": {"$exists": False}}]}
    if status_filter:
        query["status"]=status_filter
    if model_id:
        query["model_id"]=model_id

    cursor=sessions_col.find(query).sort("created_at", -1).limit(50)
    docs=await cursor.to_list(length=50)
    return [await _serialize_session(doc) for doc in docs]


@router.get("/{session_key}", response_model=SessionOut)
async def get_session(session_key: str):
    doc=await _get_or_404_session(session_key)
    return await _serialize_session(doc)


@router.get("/invite/{token}", response_model=SessionOut)
async def get_session_by_invite(token: str):
    sessions_col=get_sessions_collection()
    doc=await sessions_col.find_one({"invite_token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Invalid invite token or session not found")
    return await _serialize_session(doc)


@router.post("/{session_key}/join", response_model=SessionOut)
async def join_session(
    session_key: str,
    payload: SessionJoin,
    current_user: dict=Depends(get_current_user),
):
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session(session_key)

    if doc["status"]!=SessionStatus.open.value:
        raise HTTPException(status_code=409, detail="Only open sessions can be joined.")

    if doc.get("session_type")=="private":
        if not payload.invite_token or payload.invite_token!=doc.get("invite_token"):
            raise HTTPException(status_code=403, detail="Valid invite token is required for private sessions.")

    now=datetime.now(timezone.utc)
    user_id=str(current_user["_id"])
    username=current_user.get("username", "unknown")

    participants=doc.get("participants", [])
    if not any(p.get("user_id")==user_id for p in participants):
        participants.append({"user_id": user_id, "username": username, "joined_at": now})

    await sessions_col.update_one(
        {"session_key": session_key},
        {
            "$set": {
                "participants": participants,
                "connected_clients": len(participants),
                "updated_at": now,
            }
        },
    )

    await event_bus.publish("session_joined", {
        "session_key": session_key,
        "username": username,
        "connected_clients": len(participants),
    })

    updated=await sessions_col.find_one({"session_key": session_key})
    return await _serialize_session(updated)

@router.delete("/{session_id}")
async def delete_session(
    session_id: str,
    current_user: dict=Depends(get_current_user),
):
    """
    Only the session lead (owner) can delete a session.
    Deletes the session document from MongoDB.
    """
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session_by_id(session_id)

    owner_id_str=str(current_user["_id"])
    if doc["lead_user_id"]!=owner_id_str:
        raise HTTPException(
            status_code=403,
            detail="Only the session lead can delete this session.",
        )

    session_key=doc["session_key"]
    await sessions_col.delete_one({"_id": doc["_id"]})

    await event_bus.publish("session_deleted", {
        "session_key": session_key,
        "session_name": doc.get("session_name", ""),
    })

    return {"message": f"Session '{doc.get('session_name', 'FL Session')}' deleted successfully."}

@router.post("/{session_id}/request-access", response_model=SessionOut)
async def request_session_access(
    session_id: str,
    payload: SessionAccessRequest,
    current_user: dict=Depends(get_current_user),
):
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session_by_id(session_id)

    if doc["status"]!=SessionStatus.open.value:
        raise HTTPException(status_code=409, detail="Session is not open for new members.")
    if not doc.get("join_open", True):
        raise HTTPException(status_code=409, detail="Session owner has stopped accepting new requests.")

    user_id=str(current_user["_id"])
    username=current_user.get("username", "unknown")
    participants=doc.get("participants", [])
    if any(p.get("user_id")==user_id for p in participants):
        return await _serialize_session(doc)

    requests=doc.get("join_requests", [])
    if any(r.get("user_id")==user_id for r in requests):
        return await _serialize_session(doc)

    now=datetime.now(timezone.utc)
    requests.append({
        "user_id": user_id,
        "username": username,
        "requested_at": now,
        "note": payload.note,
        "data_dir": payload.data_dir,
    })

    await sessions_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {"join_requests": requests, "updated_at": now}},
    )

    await event_bus.publish("session_join_requested", {
        "session_key": doc["session_key"],
        "session_name": doc.get("session_name", ""),
        "username": username,
    })
    await _append_training_event(doc["session_key"], "session_join_requested", {
        "username": username,
        "session_name": doc.get("session_name", ""),
    })

    updated=await sessions_col.find_one({"_id": doc["_id"]})
    return await _serialize_session(updated)


@router.post("/{session_id}/requests/{request_user_id}/approve", response_model=SessionOut)
async def approve_session_request(
    session_id: str,
    request_user_id: str,
    current_user: dict=Depends(get_current_user),
):
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session_by_id(session_id)

    if doc["lead_user_id"]!=str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only the session lead can approve requests.")

    requests=doc.get("join_requests", [])
    req=next((r for r in requests if r.get("user_id")==request_user_id), None)
    if not req:
        raise HTTPException(status_code=404, detail="Join request not found.")

    participants=doc.get("participants", [])
    if not any(p.get("user_id")==request_user_id for p in participants):
        participants.append({
            "user_id": req.get("user_id"),
            "username": req.get("username", "unknown"),
            "joined_at": datetime.now(timezone.utc),
            "data_dir": req.get("data_dir"),
        })

    requests=[r for r in requests if r.get("user_id")!=request_user_id]
    now=datetime.now(timezone.utc)
    await sessions_col.update_one(
        {"_id": doc["_id"]},
        {
            "$set": {
                "participants": participants,
                "connected_clients": len(participants),
                "join_requests": requests,
                "updated_at": now,
            }
        },
    )

    await event_bus.publish("session_request_approved", {
        "session_key": doc["session_key"],
        "approved_username": req.get("username", "unknown"),
        "connected_clients": len(participants),
    })
    await _append_training_event(doc["session_key"], "session_request_approved", {
        "approved_username": req.get("username", "unknown"),
        "connected_clients": len(participants),
    })

    progress=doc.get("member_progress", {})
    approved_name=req.get("username", "unknown")
    progress[approved_name]={
        "status": "approved",
        "rounds_completed": 0,
        "last_update": now,
    }
    await sessions_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {"member_progress": progress, "updated_at": now}},
    )

    updated=await sessions_col.find_one({"_id": doc["_id"]})
    return await _serialize_session(updated)


@router.post("/{session_id}/lock-join", response_model=SessionOut)
async def lock_session_join(
    session_id: str,
    current_user: dict=Depends(get_current_user),
):
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session_by_id(session_id)

    if doc["lead_user_id"]!=str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only the session lead can lock member requests.")

    now=datetime.now(timezone.utc)
    await sessions_col.update_one(
        {"_id": doc["_id"]},
        {"$set": {"join_open": False, "updated_at": now}},
    )
    updated=await sessions_col.find_one({"_id": doc["_id"]})
    return await _serialize_session(updated)


@router.post("/{session_key}/start", response_model=SessionOut)
async def start_session(
    session_key: str,
    payload: SessionStart,
    current_user: dict=Depends(get_current_user),
):
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session(session_key)

    if doc["lead_user_id"]!=str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only the session lead can start training.")

    if doc["status"]!=SessionStatus.open.value:
        raise HTTPException(status_code=409, detail="Session is not in open state.")

    connected=doc.get("connected_clients", len(doc.get("participants", [])))
    if payload.confirm_min_clients and connected<doc["min_clients"]:
        raise HTTPException(
            status_code=409,
            detail=f"Need at least {doc['min_clients']} joined members before starting.",
        )

    now=datetime.now(timezone.utc)
    fl_port=_pick_available_fl_port(settings.fl_server_port)
    await sessions_col.update_one(
        {"session_key": session_key},
        {
            "$set": {
                "status": SessionStatus.training.value,
                "fl_server_port": fl_port,
                "updated_at": now,
            }
        },
    )

    await event_bus.publish("session_started", {
        "session_key": session_key,
        "session_name": doc.get("session_name", ""),
        "connected_clients": connected,
        "fl_server_port": fl_port,
    })
    await _append_training_event(session_key, "session_started", {
        "session_name": doc.get("session_name", ""),
        "connected_clients": connected,
        "fl_server_port": fl_port,
    })
    await _append_training_event(session_key, "round_start", {
        "round": 1,
        "message": "Training session initialized. Waiting for first client updates.",
    })

    participants=doc.get("participants", [])
    lead_user_id=str(doc.get("lead_user_id", ""))
    participant_clients=[
        p for p in participants
        if str(p.get("user_id", ""))!=lead_user_id
    ]
    member_progress={
        (p.get("username") or p.get("user_id") or "unknown"): {
            "status": "training",
            "rounds_completed": 0,
            "last_update": now,
        }
        for p in participants
    }
    await sessions_col.update_one(
        {"session_key": session_key},
        {"$set": {"member_progress": member_progress, "updated_at": now}},
    )

    existing_thread=_active_fl_servers.get(session_key)
    if not existing_thread or not existing_thread.is_alive():

        models_col=get_models_collection()
        try:
            from bson.objectid import ObjectId as _ObjId
            model_doc=await models_col.find_one({"_id": _ObjId(doc["model_id"])})
        except Exception:
            model_doc=None

        if model_doc is None:
            base_models_col=get_base_models_collection()
            try:
                model_doc=await base_models_col.find_one({"id": doc["model_id"]})
            except Exception:
                model_doc=None

        _raw_arch=(model_doc or {}).get("architecture_type") or (model_doc or {}).get("id") or "resnet18"
        from fl.models import resolve_architecture as _resolve_arch
        architecture=_resolve_arch(_raw_arch)

        def _run_fl():
            try:
                from fl.run_server import run_server
                import subprocess, sys, time, threading
                from pathlib import Path

                def _spawn_clients(participants_list, lead_data_dir, port, shape, arch):
                    time.sleep(5)  # Give Flower gRPC server time to bind
                    shape_str=",".join(map(str, shape)) if shape else "3,224,224"
                    _backend_dir=str(Path(__file__).resolve().parent.parent.parent.parent)

                    def __watch_proc(proc, label):
                        """Watch a client process; publish an error event if it exits too early."""
                        try:
                            stdout, stderr=proc.communicate(timeout=60)
                            if proc.returncode!=0:
                                err_txt=(stderr or b"").decode("utf-8", errors="replace").strip()
                                out_txt=(stdout or b"").decode("utf-8", errors="replace").strip()
                                msg=err_txt or out_txt or f"Process exited with code {proc.returncode}"
                                import asyncio as _aio
                                _el=_aio.new_event_loop()
                                _el.run_until_complete(event_bus.publish("local_client_error", {
                                    "session_key": session_key,
                                    "client": label,
                                    "error": msg[-500:],  # trim to last 500 chars
                                }))
                                _el.run_until_complete(_append_training_event(session_key, "local_client_error", {
                                    "client": label,
                                    "error": msg[-300:],
                                }))
                                _el.close()
                        except Exception:
                            pass  # Process still running or watch failed  that's fine

                    def __launch(d_dir, label):
                        if isinstance(d_dir, str):
                            d_dir=d_dir.strip().strip('"').strip("'")
                        if not d_dir:
                            d_dir="./dataset"
                        cmd=[
                            sys.executable, "-m", "fl.client",
                            "--server", f"127.0.0.1:{port}",
                            "--session-key", session_key,
                            "--data-shape", shape_str,
                            "--data-dir", str(d_dir),
                            "--architecture", str(arch),
                        ]
                        proc=subprocess.Popen(
                            cmd,
                            cwd=_backend_dir,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                        )
                        threading.Thread(target=__watch_proc, args=(proc, label), daemon=True).start()
                        time.sleep(1)

                    client_count=1 + len(participants_list)  # lead + non-lead participants
                    try:
                        import asyncio as _aio2
                        _el2=_aio2.new_event_loop()
                        _el2.run_until_complete(event_bus.publish("local_clients_spawned", {
                            "session_key": session_key,
                            "count": client_count,
                            "fl_port": port,
                            "message": f"Launching {client_count} local FL client(s) †’ 127.0.0.1:{port}",
                        }))
                        _el2.close()
                    except Exception:
                        pass

                    __launch(lead_data_dir, "lead")

                    for p in participants_list:
                        __launch(p.get("data_dir"), p.get("username", "participant"))

                threading.Thread(
                    target=_spawn_clients,
                    args=(participant_clients, payload.data_dir, fl_port, doc.get("required_input_shape", []), architecture),
                    daemon=True
                ).start()

                STALL_TIMEOUT_SECS=300  # 5 minutes

                def _stall_detector():
                    time.sleep(STALL_TIMEOUT_SECS)
                    try:
                        import asyncio as _aio
                        _sloop=_aio.new_event_loop()
                        _sessions=get_sessions_collection()

                        async def _check_and_warn():
                            _doc=await _sessions.find_one(
                                {"session_key": session_key},
                                {"current_round": 1, "status": 1},
                            )
                            if not _doc:
                                return
                            if _doc.get("status")=="Training" and (_doc.get("current_round") or 0)==0:
                                await event_bus.publish("training_stalled", {
                                    "session_key": session_key,
                                    "message": (
                                        "No training round has completed after 5 minutes. "
                                        "Ensure each participant's FL client is running and "
                                        "connected to the FL server on the port shown above."
                                    ),
                                })
                                await _append_training_event(session_key, "training_stalled", {
                                    "message": (
                                        "No training round completed after 5 min. "
                                        "Check that FL clients have a valid dataset and are "
                                        "connecting to the correct FL port."
                                    ),
                                })

                        _sloop.run_until_complete(_check_and_warn())
                        _sloop.close()
                    except Exception:
                        pass

                threading.Thread(target=_stall_detector, daemon=True).start()

                run_server(
                    session_key=session_key,
                    required_input_shape=doc.get("required_input_shape", []),
                    host=settings.fl_server_host,
                    port=fl_port,
                    num_rounds=doc.get("max_rounds", settings.fl_rounds),
                    min_clients=doc.get("min_clients", 2),
                    policy=doc.get("validation_policy", "shape_only"),
                )
            except RuntimeError as exc:
                _msg=str(exc)
                try:
                    import asyncio as _aio
                    _loop=_aio.new_event_loop()
                    _loop.run_until_complete(event_bus.publish("server_launch_failed", {
                        "session_key": session_key,
                        "error": _msg,
                    }))
                    _loop.run_until_complete(_append_training_event(session_key, "server_launch_failed", {
                        "error": _msg,
                    }))
                    _loop.close()
                except Exception:
                    pass
            except Exception as exc:
                _msg=str(exc)
                try:
                    import asyncio as _aio
                    _loop=_aio.new_event_loop()
                    _loop.run_until_complete(event_bus.publish("server_runtime_failed", {
                        "session_key": session_key,
                        "error": _msg,
                    }))
                    _loop.run_until_complete(_append_training_event(session_key, "server_runtime_failed", {
                        "error": _msg,
                    }))
                    _loop.close()
                except Exception:
                    pass
            finally:
                _active_fl_servers.pop(session_key, None)

        server_thread=threading.Thread(target=_run_fl, name=f"fl-server-{session_key}", daemon=True)
        _active_fl_servers[session_key]=server_thread
        server_thread.start()

    updated=await sessions_col.find_one({"session_key": session_key})
    return await _serialize_session(updated)


@router.post("/{session_key}/publish-final")
async def publish_final_model(
    session_key: str,
    background_tasks: BackgroundTasks,
    current_user: dict=Depends(get_current_user),
):
    """
    Start Pinata upload as a BackgroundTask  returns 202 immediately.
    Pinata uploads can take 30-120s; awaiting inline causes ERR_EMPTY_RESPONSE.
    Frontend polls GET /sessions/{key} until final_model_cid appears.
    """
    doc=await _get_or_404_session(session_key)
    if doc["lead_user_id"]!=str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only the session lead can publish the final model.")
    if doc["status"]!=SessionStatus.closed.value:
        raise HTTPException(status_code=409, detail="Session must be closed after training before publishing.")
    if doc.get("final_model_cid"):
        return {
            "message": "Final model already published.",
            "cid": doc["final_model_cid"],
            "status": "already_published",
        }

    sessions_col=get_sessions_collection()
    await sessions_col.update_one(
        {"session_key": session_key},
        {"$set": {"publish_status": "uploading", "updated_at": datetime.now(timezone.utc)}},
    )

    async def _do_publish():
        try:
            await _publish_session_artifact(doc)
        except Exception as exc:
            logger.error("[publish-final] Upload failed for %s: %s", session_key, exc)
            await sessions_col.update_one(
                {"session_key": session_key},
                {"$set": {"publish_status": "failed", "updated_at": datetime.now(timezone.utc)}},
            )
            await event_bus.publish("model_publish_failed", {
                "session_key": session_key,
                "error": str(exc),
            })

    background_tasks.add_task(_do_publish)
    return {
        "message": "Publishing started. Poll GET /sessions/{session_key} for final_model_cid.",
        "status": "uploading",
    }


@router.post("/{session_key}/invite", response_model=SessionOut)
async def rotate_invite_token(
    session_key: str,
    current_user: dict=Depends(get_current_user),
):
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session(session_key)

    if doc["lead_user_id"]!=str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Only the session lead can manage invite links.")

    if doc.get("session_type")!="private":
        raise HTTPException(status_code=400, detail="Only private sessions have invite links.")

    new_token=secrets.token_urlsafe(16)
    now=datetime.now(timezone.utc)
    await sessions_col.update_one(
        {"session_key": session_key},
        {"$set": {"invite_token": new_token, "updated_at": now}}
    )
    doc["invite_token"]=new_token
    doc["updated_at"]=now
    return await _serialize_session(doc)


@router.delete("/{session_key}/clear-events")
async def clear_training_events(
    session_key: str,
    current_user: dict=Depends(get_current_user),
):
    """
    Wipe all persisted training_events for a session.

    Use this to remove stale/simulation events that were stored in MongoDB
    by a previous run of the server, so the TrainingMonitor shows a clean slate.

    Only the session lead (owner) can call this endpoint.
    """
    sessions_col=get_sessions_collection()
    doc=await _get_or_404_session(session_key)

    if doc["lead_user_id"]!=str(current_user["_id"]):
        raise HTTPException(
            status_code=403,
            detail="Only the session lead can clear training events.",
        )

    now=datetime.now(timezone.utc)
    await sessions_col.update_one(
        {"session_key": session_key},
        {"$set": {"training_events": [], "updated_at": now}},
    )
    await event_bus.publish("events_cleared", {
        "session_key": session_key,
        "message": "Training event log cleared.",
    })
    return {"message": f"Training events cleared for session '{session_key}'."}
