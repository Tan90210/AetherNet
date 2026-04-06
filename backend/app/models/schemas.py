"""
ModelMesh Backend  Pydantic Schemas (MongoDB Documents & API Models)
All collections: users, models, versions, sessions, base_models.
"""

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, Dict, Any, List
from datetime import datetime
from enum import Enum



class UserOut(BaseModel):
    id: str
    username: str
    email: str
    created_at: datetime

    model_config={"populate_by_name": True}



class BaseModelOut(BaseModel):
    id: str                           # e.g. "resnet18"
    name: str                         # e.g. "ResNet-18"
    family: str                       # "vision" | "nlp" | "audio" | "edge" | "vision_transformer" | "custom"
    input_shape: List[int]
    params_millions: Optional[float]=None
    description: str

    model_config={"populate_by_name": True}



class ModelCreate(BaseModel):
    """Used for simple JSON-only model registration (no file upload)."""
    name: str=Field(..., min_length=1, max_length=120)
    description: str=Field(default="", max_length=2000)
    base_model_id: str=Field(..., description="ID from the base_models catalogue, or 'custom'")
    tags: List[str]=Field(default=[])
    input_shape: List[int]=Field(default=[], description="e.g. [3, 224, 224] for RGB images")
    is_public: bool=True


class ModelOut(BaseModel):
    id: str
    original_model_id: str
    name: str
    description: str
    base_model_id: str
    architecture_type: str            # Human-readable name from the catalogue
    tags: List[str]
    input_shape: List[int]
    current_version_cid: Optional[str]=None
    pinata_gateway_url: Optional[str]=None
    owner_id: str
    owner_username: str
    is_public: bool
    is_base_model: bool=False
    download_count: int=0
    created_at: datetime
    updated_at: datetime

    model_config={"populate_by_name": True}



class VersionOut(BaseModel):
    id: str
    parent_id: str
    new_cid: str
    pinata_gateway_url: str
    session_key: Optional[str]=None
    metrics_json: Dict[str, Any]
    notes: str
    version_number: int
    pinned_by: str
    timestamp: datetime

    model_config={"populate_by_name": True}



class SessionStatus(str, Enum):
    open="Open"
    training="Training"
    closed="Closed"


class SessionType(str, Enum):
    public="public"
    private="private"


class ValidationPolicy(str, Enum):
    shape_only="shape_only"
    gradient_norm="gradient_norm"


class DataFamily(str, Enum):
    """Data modality types for federated learning."""
    vision="vision"
    vision_transformer="vision_transformer"
    nlp="nlp"
    audio="audio"
    edge="edge"


class TrainingConfig(BaseModel):
    """Training hyperparameters for FL session."""
    learning_rate: float=Field(default=0.001, ge=0.00001, le=0.1)
    batch_size: int=Field(default=32, ge=1, le=512)
    local_epochs: int=Field(default=1, ge=1, le=10)
    optimizer: str=Field(default="adam")  # "adam", "sgd"
    weight_decay: float=Field(default=0.0, ge=0.0, le=0.1)


class SessionCreate(BaseModel):
    session_name: str=Field(default="", max_length=120)
    model_id: str
    required_input_shape: List[int]
    min_clients: int=Field(default=2, ge=1, le=100)
    max_rounds: int=Field(default=3, ge=1, le=50)
    description: str=Field(default="", max_length=500)
    session_type: SessionType=Field(default=SessionType.public)
    validation_policy: ValidationPolicy=Field(default=ValidationPolicy.shape_only)
    data_family: DataFamily=Field(default=DataFamily.vision)
    training_config: TrainingConfig=Field(default_factory=TrainingConfig)


class RoundMetrics(BaseModel):
    """Metrics for a training round."""
    round_number: int
    loss: Optional[float]=None
    accuracy: Optional[float]=None
    num_clients: int
    timestamp: datetime


class SessionJoinRequestOut(BaseModel):
    user_id: str
    clerk_user_id: Optional[str]=None
    username: str
    requested_at: datetime


class SessionOut(BaseModel):
    id: str
    session_key: str
    session_name: str=""
    model_id: str
    lead_user_id: str
    lead_clerk_user_id: Optional[str]=None
    lead_username: str
    required_input_shape: List[int]
    min_clients: int
    max_rounds: int
    current_round: int=0
    connected_clients: int=0
    participant_user_ids: List[str]=Field(default=[])
    participant_clerk_user_ids: List[str]=Field(default=[])
    participant_usernames: List[str]=Field(default=[])
    pending_requests: List[SessionJoinRequestOut]=Field(default=[])
    join_open: bool=True
    description: str
    session_type: SessionType
    validation_policy: ValidationPolicy
    data_family: DataFamily=DataFamily.vision
    training_config: Optional[Dict[str, Any]]=None
    fl_server_port: Optional[int]=None
    member_progress: Dict[str, Dict[str, Any]]=Field(default={})
    training_events: List[Dict[str, Any]]=Field(default=[])
    invite_token: Optional[str]=None
    status: SessionStatus
    round_metrics: List[RoundMetrics]=Field(default=[])
    final_model_cid: Optional[str]=None
    created_at: datetime
    updated_at: datetime

    model_config={"populate_by_name": True}


class SessionJoin(BaseModel):
    invite_token: Optional[str]=None


class SessionStart(BaseModel):
    confirm_min_clients: bool=True
    data_dir: Optional[str]=None


class SessionAccessRequest(BaseModel):
    note: str=Field(default="", max_length=300)
    data_dir: Optional[str]=None
