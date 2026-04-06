"""
ModelMesh Backend  Async MongoDB Connection (Motor)
Provides a get_db() FastAPI dependency and collection accessors.
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.core.config import get_settings
import logging

logger=logging.getLogger(__name__)
settings=get_settings()

_client: AsyncIOMotorClient | None=None


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        _client=AsyncIOMotorClient(settings.mongodb_uri)
        logger.info("MongoDB client initialised.")
    return _client


def get_db() -> AsyncIOMotorDatabase:
    return get_client()[settings.mongodb_db_name]


async def close_db():
    global _client
    if _client is not None:
        _client.close()
        _client=None
        logger.info("MongoDB client closed.")



def get_models_collection():
    return get_db()["models"]

def get_versions_collection():
    return get_db()["versions"]

def get_sessions_collection():
    return get_db()["sessions"]

def get_users_collection():
    return get_db()["users"]

def get_base_models_collection():
    return get_db()["base_models"]



BASE_MODELS=[
    {"id": "resnet18",       "name": "ResNet-18",       "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 11.7,  "description": "18-layer residual network. Lightweight & fast."},
    {"id": "resnet50",       "name": "ResNet-50",       "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 25.6,  "description": "50-layer ResNet with bottleneck blocks."},
    {"id": "resnet101",      "name": "ResNet-101",      "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 44.5,  "description": "Deep 101-layer variant for high accuracy."},
    {"id": "vgg16",          "name": "VGG-16",          "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 138.4, "description": "16-layer deep CNN with uniform 3Ã—3 filters."},
    {"id": "vgg19",          "name": "VGG-19",          "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 143.7, "description": "Deeper 19-layer variant of VGG."},
    {"id": "efficientnet_b0","name": "EfficientNet-B0", "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 5.3,   "description": "Compound-scaled CNN, efficient baseline."},
    {"id": "efficientnet_b4","name": "EfficientNet-B4", "family": "vision",      "input_shape": [3, 380, 380], "params_millions": 19.3,  "description": "Scaled-up EfficientNet for high accuracy."},
    {"id": "efficientnet_b7","name": "EfficientNet-B7", "family": "vision",      "input_shape": [3, 600, 600], "params_millions": 66.3,  "description": "Largest EfficientNet variant."},
    {"id": "densenet121",    "name": "DenseNet-121",    "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 8.0,   "description": "Dense skip connections for feature reuse."},
    {"id": "densenet201",    "name": "DenseNet-201",    "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 20.0,  "description": "Deeper DenseNet with rich feature maps."},
    {"id": "mobilenetv2",    "name": "MobileNetV2",     "family": "edge",        "input_shape": [3, 224, 224], "params_millions": 3.4,   "description": "Inverted residuals for mobile deployment."},
    {"id": "mobilenetv3",    "name": "MobileNetV3-Large","family": "edge",       "input_shape": [3, 224, 224], "params_millions": 5.4,   "description": "Optimised for mobile with SE blocks."},
    {"id": "inception_v3",   "name": "Inception-v3",    "family": "vision",      "input_shape": [3, 299, 299], "params_millions": 23.8,  "description": "Inception modules with factorised convolutions."},
    {"id": "convnext_t",     "name": "ConvNeXt-Tiny",   "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 28.6,  "description": "Modern pure-CNN rivalling Vision Transformers."},
    {"id": "convnext_b",     "name": "ConvNeXt-Base",   "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 88.6,  "description": "Larger ConvNeXt for demanding tasks."},
    {"id": "squeezenet",     "name": "SqueezeNet1.1",   "family": "edge",        "input_shape": [3, 224, 224], "params_millions": 1.2,   "description": "AlexNet accuracy at 50Ã— fewer parameters."},
    {"id": "shufflenet_v2",  "name": "ShuffleNetV2",    "family": "edge",        "input_shape": [3, 224, 224], "params_millions": 2.3,   "description": "Channel shuffle for efficient mobile inference."},
    {"id": "regnetx_400m",   "name": "RegNetX-400MF",   "family": "vision",      "input_shape": [3, 224, 224], "params_millions": 5.16,  "description": "Quantisable network from FB Research."},
    {"id": "vit_b16",        "name": "ViT-B/16",        "family": "vision_transformer","input_shape": [3, 224, 224], "params_millions": 86.6, "description": "Original Vision Transformer, 16Ã—16 patches."},
    {"id": "vit_l16",        "name": "ViT-L/16",        "family": "vision_transformer","input_shape": [3, 224, 224], "params_millions": 307.0,"description": "Large ViT for top accuracy."},
    {"id": "deit_s",         "name": "DeiT-Small",      "family": "vision_transformer","input_shape": [3, 224, 224], "params_millions": 22.1, "description": "Data-efficient image Transformer, small."},
    {"id": "swin_t",         "name": "Swin-Tiny",       "family": "vision_transformer","input_shape": [3, 224, 224], "params_millions": 28.3, "description": "Hierarchical ViT with shifted windows."},
    {"id": "swin_b",         "name": "Swin-Base",       "family": "vision_transformer","input_shape": [3, 224, 224], "params_millions": 87.8, "description": "Larger Swin for demanding vision tasks."},
    {"id": "bert_base",      "name": "BERT-base",       "family": "nlp",         "input_shape": [1, 512],       "params_millions": 110.0, "description": "Bidirectional Transformer for NLP tasks."},
    {"id": "bert_large",     "name": "BERT-large",      "family": "nlp",         "input_shape": [1, 512],       "params_millions": 340.0, "description": "Larger BERT with 24 layers."},
    {"id": "distilbert",     "name": "DistilBERT",      "family": "nlp",         "input_shape": [1, 512],       "params_millions": 66.4,  "description": "Distilled BERT  40% smaller, 97% accuracy."},
    {"id": "roberta_base",   "name": "RoBERTa-base",    "family": "nlp",         "input_shape": [1, 512],       "params_millions": 125.0, "description": "Robustly optimised BERT pretraining."},
    {"id": "gpt2",           "name": "GPT-2",           "family": "nlp",         "input_shape": [1, 1024],      "params_millions": 117.0, "description": "Autoregressive language model by OpenAI."},
    {"id": "t5_small",       "name": "T5-Small",        "family": "nlp",         "input_shape": [1, 512],       "params_millions": 60.0,  "description": "Text-to-text transfer Transformer, small size."},
    {"id": "albert_base",    "name": "ALBERT-base",     "family": "nlp",         "input_shape": [1, 512],       "params_millions": 12.0,  "description": "A Lite BERT with parameter sharing."},
    {"id": "electra_small",  "name": "ELECTRA-small",   "family": "nlp",         "input_shape": [1, 512],       "params_millions": 14.0,  "description": "Replaced token detection pre-training."},
    {"id": "wav2vec2",       "name": "Wav2Vec2-base",   "family": "audio",       "input_shape": [1, 16000],     "params_millions": 95.0,  "description": "Self-supervised speech representation model."},
    {"id": "whisper_small",  "name": "Whisper-small",   "family": "audio",       "input_shape": [80, 3000],     "params_millions": 244.0, "description": "OpenAI's robust ASR model."},
    {"id": "custom",         "name": "Custom/Other",  "family": "custom",      "input_shape": [],             "params_millions": None,  "description": "A novel or custom architecture not in the list."},
]


async def seed_base_models():
    """Upsert all base model definitions at startup. Idempotent."""
    col=get_base_models_collection()
    for entry in BASE_MODELS:
        await col.update_one(
            {"id": entry["id"]},
            {"$set": entry},
            upsert=True,
        )
    logger.info("Base models seeded/updated: %d architectures available.", len(BASE_MODELS))



async def create_indexes():
    """Create MongoDB indexes on startup for performance."""
    db=get_db()
    from pymongo.errors import OperationFailure

    try:
        await db["models"].create_index("original_model_id")
    except OperationFailure as e:
        if "IndexKeySpecsConflict" in str(e) or "IndexOptionsConflict" in str(e):
            logger.info("Dropping conflicting index on 'original_model_id'...")
            await db["models"].drop_index("original_model_id_1")
            await db["models"].create_index("original_model_id")
        else:
            raise

    await db["models"].create_index("owner_id")
    await db["models"].create_index("base_model_id")

    await db["versions"].create_index("parent_id")
    await db["versions"].create_index("session_key")

    await db["sessions"].create_index("session_key", unique=True)
    await db["sessions"].create_index("lead_user_id")

    await db["users"].create_index("email", unique=True)
    await db["users"].create_index("clerk_user_id", unique=True, sparse=True)

    await db["base_models"].create_index("id", unique=True)
    await db["base_models"].create_index("family")

    logger.info("MongoDB indexes created.")
