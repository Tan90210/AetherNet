"""
AetherNet FL  Model Architectures for Federated Learning

All models:
  - Accept ANY input resolution via AdaptiveAvgPool (no fixed H/W assumption)
  - Store ._architecture and ._num_classes so clients can detect num_classes
    mismatches before applying server weights  preventing shape crash.
  - Registered in MODEL_REGISTRY for the session creation dropdown.

Canonical input sizes (client.py resizes to these before training):
  resnet18/mobilenetv2/efficientnet_b0/vit_small : 224Ã—224
  tinynet                                               : 64Ã—64
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Tuple, List, Dict, Any
import numpy as np


ARCHITECTURE_INPUT_SIZES: Dict[str, Tuple[int, int]]={
    "resnet18":         (224, 224),
    "mobilenetv2":      (224, 224),
    "efficientnet_b0":  (224, 224),
    "vit_small":        (224, 224),
    "tinynet":          (64,  64),
    "bert_classifier":  (224, 224),
    "audio_cnn_1d":     (224, 224),
}



class ResidualBlock(nn.Module):
    def __init__(self, in_channels: int, out_channels: int, stride: int=1):
        super().__init__()
        self.conv1=nn.Conv2d(in_channels, out_channels, 3, stride=stride, padding=1, bias=False)
        self.bn1=nn.BatchNorm2d(out_channels)
        self.conv2=nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False)
        self.bn2=nn.BatchNorm2d(out_channels)
        self.shortcut=nn.Sequential()
        if stride!=1 or in_channels!=out_channels:
            self.shortcut=nn.Sequential(
                nn.Conv2d(in_channels, out_channels, 1, stride=stride, bias=False),
                nn.BatchNorm2d(out_channels),
            )

    def forward(self, x):
        return F.relu(self.bn2(self.conv2(F.relu(self.bn1(self.conv1(x))))) + self.shortcut(x))


class ResNet18(nn.Module):
    """ResNet-18 with AdaptiveAvgPool  accepts any HÃ—W input."""
    def __init__(self, num_classes: int=10):
        super().__init__()
        self.conv1=nn.Conv2d(3, 64, 7, stride=2, padding=3, bias=False)
        self.bn1=nn.BatchNorm2d(64)
        self.layer1=self._make(64,  64,  2, 1)
        self.layer2=self._make(64,  128, 2, 2)
        self.layer3=self._make(128, 256, 2, 2)
        self.layer4=self._make(256, 512, 2, 2)
        self.avgpool=nn.AdaptiveAvgPool2d((1, 1))
        self.fc=nn.Linear(512, num_classes)

    def _make(self, in_c, out_c, n, stride):
        return nn.Sequential(ResidualBlock(in_c, out_c, stride),
                             *[ResidualBlock(out_c, out_c) for _ in range(1, n)])

    def forward(self, x):
        x=F.relu(self.bn1(self.conv1(x)))
        x=self.layer4(self.layer3(self.layer2(self.layer1(x))))
        return self.fc(self.avgpool(x).view(x.size(0), -1))


class InvertedResidual(nn.Module):
    def __init__(self, inp, oup, stride, hidden_dim):
        super().__init__()
        self.use_res=stride==1 and inp==oup
        layers=[]
        if hidden_dim!=inp:
            layers+=[nn.Conv2d(inp, hidden_dim, 1, bias=False), nn.BatchNorm2d(hidden_dim), nn.ReLU6(inplace=True)]
        layers+=[
            nn.Conv2d(hidden_dim, hidden_dim, 3, stride, 1, groups=hidden_dim, bias=False),
            nn.BatchNorm2d(hidden_dim), nn.ReLU6(inplace=True),
            nn.Conv2d(hidden_dim, oup, 1, bias=False), nn.BatchNorm2d(oup),
        ]
        self.conv=nn.Sequential(*layers)

    def forward(self, x):
        return x + self.conv(x) if self.use_res else self.conv(x)


class MobileNetV2(nn.Module):
    """MobileNetV2  accepts any HÃ—W input via global average pool."""
    def __init__(self, num_classes: int=10):
        super().__init__()
        def ir(i, o, s, t): return InvertedResidual(i, o, s, int(round(i*t)))
        self.features=nn.Sequential(
            nn.Conv2d(3, 32, 3, stride=2, padding=1, bias=False), nn.BatchNorm2d(32), nn.ReLU6(inplace=True),
            ir(32,16,1,1),
            ir(16,24,2,6), ir(24,24,1,6),
            ir(24,32,2,6), ir(32,32,1,6), ir(32,32,1,6),
            ir(32,64,2,6), ir(64,64,1,6), ir(64,64,1,6), ir(64,64,1,6),
            ir(64,96,1,6), ir(96,96,1,6), ir(96,96,1,6),
            ir(96,160,2,6), ir(160,160,1,6), ir(160,160,1,6),
            ir(160,320,1,6),
            nn.Conv2d(320, 1280, 1, bias=False), nn.BatchNorm2d(1280), nn.ReLU6(inplace=True),
        )
        self.classifier=nn.Sequential(nn.Dropout(0.2), nn.Linear(1280, num_classes))

    def forward(self, x):
        return self.classifier(self.features(x).mean([2, 3]))


class EfficientNetB0(nn.Module):
    """EfficientNetB0  AdaptiveAvgPool in head accepts any HÃ—W."""
    def __init__(self, num_classes: int=10):
        super().__init__()
        def mb(i, o, k, s, t):
            h=int(i*t)
            lrs=[]
            if t!=1: lrs+=[nn.Conv2d(i, h, 1, bias=False), nn.BatchNorm2d(h), nn.SiLU(inplace=True)]
            lrs+=[nn.Conv2d(h, h, k, s, k//2, groups=h, bias=False), nn.BatchNorm2d(h), nn.SiLU(inplace=True),
                    nn.Conv2d(h, o, 1, bias=False), nn.BatchNorm2d(o)]
            return nn.Sequential(*lrs)
        self.stem=nn.Sequential(nn.Conv2d(3,32,3,stride=2,padding=1,bias=False), nn.BatchNorm2d(32), nn.SiLU(inplace=True))
        self.blocks=nn.Sequential(
            mb(32,16,3,1,1),
            mb(16,24,3,2,6), mb(24,24,3,1,6),
            mb(24,40,5,2,6), mb(40,40,5,1,6),
            mb(40,80,3,2,6), mb(80,80,3,1,6), mb(80,80,3,1,6),
            mb(80,112,5,1,6), mb(112,112,5,1,6), mb(112,112,5,1,6),
            mb(112,192,5,2,6), mb(192,192,5,1,6), mb(192,192,5,1,6), mb(192,192,5,1,6),
            mb(192,320,3,1,6),
        )
        self.head=nn.Sequential(
            nn.Conv2d(320,1280,1,bias=False), nn.BatchNorm2d(1280), nn.SiLU(inplace=True),
            nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Dropout(0.2), nn.Linear(1280, num_classes),
        )

    def forward(self, x): return self.head(self.blocks(self.stem(x)))


class ViTSmall(nn.Module):
    """ViT-Small. Client always resizes to 224Ã—224 so patch grid is stable."""
    def __init__(self, num_classes=10, img_size=224, patch_size=16,
                 hidden_dim=384, num_heads=6, num_layers=12, mlp_dim=1536):
        super().__init__()
        self.patch_size=patch_size
        num_patches=(img_size // patch_size) ** 2
        self.patch_embed=nn.Linear(3*patch_size*patch_size, hidden_dim)
        self.cls_token=nn.Parameter(torch.randn(1, 1, hidden_dim))
        self.pos_embed=nn.Parameter(torch.randn(1, num_patches + 1, hidden_dim))
        self.pos_drop=nn.Dropout(0.1)
        self.transformer=nn.TransformerEncoder(
            nn.TransformerEncoderLayer(d_model=hidden_dim, nhead=num_heads,
                                       dim_feedforward=mlp_dim, batch_first=True, dropout=0.1),
            num_layers=num_layers)
        self.norm=nn.LayerNorm(hidden_dim)
        self.head=nn.Linear(hidden_dim, num_classes)

    def forward(self, x):
        B, C, H, W=x.shape
        p=self.patch_size
        x=x.reshape(B, C, H//p, p, W//p, p).permute(0,2,4,1,3,5).contiguous()
        x=self.patch_embed(x.reshape(B, -1, C*p*p))
        x=torch.cat((self.cls_token.expand(B,-1,-1), x), 1) + self.pos_embed
        return self.head(self.norm(self.transformer(self.pos_drop(x))[:, 0]))


class SimpleBERTClassifier(nn.Module):
    """BERT-like text classifier (NLP)."""
    def __init__(self, vocab_size=30522, num_classes=2, hidden_dim=768,
                 num_layers=12, num_heads=12, max_seq_len=512):
        super().__init__()
        self.embedding=nn.Embedding(vocab_size, hidden_dim)
        self.pos_embedding=nn.Embedding(max_seq_len, hidden_dim)
        self.transformer=nn.TransformerEncoder(
            nn.TransformerEncoderLayer(d_model=hidden_dim, nhead=num_heads,
                                       dim_feedforward=hidden_dim*4, batch_first=True, dropout=0.1),
            num_layers=num_layers)
        self.dropout=nn.Dropout(0.1)
        self.classifier=nn.Sequential(nn.Linear(hidden_dim, hidden_dim), nn.Tanh(), nn.Linear(hidden_dim, num_classes))

    def forward(self, input_ids, attention_mask=None):
        seq_len=input_ids.size(1)
        pos_ids=torch.arange(seq_len, device=input_ids.device).unsqueeze(0)
        x=self.dropout(self.embedding(input_ids) + self.pos_embedding(pos_ids))
        mask=(attention_mask.unsqueeze(1).unsqueeze(2)==0) if attention_mask is not None else None
        return self.classifier(self.transformer(x, src_key_padding_mask=mask)[:, 0])


class AudioCNN1D(nn.Module):
    """1D CNN for audio/mel-spectrogram. AdaptiveAvgPool1d handles any time_steps."""
    def __init__(self, num_classes=10, mel_bins=128, time_steps=128):
        super().__init__()
        self.conv_blocks=nn.Sequential(
            nn.Conv1d(mel_bins, 64, 3, 1, 1), nn.BatchNorm1d(64), nn.ReLU(), nn.MaxPool1d(4),
            nn.Conv1d(64, 128, 3, 1, 1),      nn.BatchNorm1d(128), nn.ReLU(), nn.MaxPool1d(4),
            nn.Conv1d(128, 256, 3, 1, 1),     nn.BatchNorm1d(256), nn.ReLU(), nn.MaxPool1d(4),
        )
        self.classifier=nn.Sequential(
            nn.AdaptiveAvgPool1d(1), nn.Flatten(),
            nn.Linear(256, 256), nn.ReLU(), nn.Dropout(0.3), nn.Linear(256, num_classes),
        )

    def forward(self, x): return self.classifier(self.conv_blocks(x))


class TinyNet(nn.Module):
    """Ultra-lightweight edge model. Accepts any input size."""
    def __init__(self, num_classes=10):
        super().__init__()
        self.features=nn.Sequential(
            nn.Conv2d(3, 16, 3, 1, 1), nn.BatchNorm2d(16), nn.ReLU(inplace=True), nn.MaxPool2d(2),
            nn.Conv2d(16, 32, 3, 1, 1), nn.BatchNorm2d(32), nn.ReLU(inplace=True), nn.MaxPool2d(2),
            nn.Conv2d(32, 32, 3, 1, 1), nn.BatchNorm2d(32), nn.ReLU(inplace=True),
            nn.AdaptiveAvgPool2d((1, 1)),
        )
        self.classifier=nn.Linear(32, num_classes)

    def forward(self, x):
        return self.classifier(self.features(x).view(x.size(0), -1))



ARCHITECTURE_ALIASES: Dict[str, str]={
    "resnet50":       "resnet18",
    "resnet101":      "resnet18",
    "resnet152":      "resnet18",
    "vgg16":          "resnet18",
    "vgg19":          "resnet18",
    "densenet121":    "resnet18",
    "densenet201":    "resnet18",
    "inception_v3":   "resnet18",
    "convnext_t":     "resnet18",
    "convnext_b":     "resnet18",
    "regnetx_400m":   "resnet18",
    "efficientnet_b4": "efficientnet_b0",
    "efficientnet_b7": "efficientnet_b0",
    "mobilenetv3":    "mobilenetv2",
    "squeezenet":     "tinynet",
    "shufflenet_v2":  "tinynet",
    "vit_b16":        "vit_small",
    "vit_l16":        "vit_small",
    "deit_s":         "vit_small",
    "swin_t":         "vit_small",
    "swin_b":         "vit_small",
    "bert_base":      "bert_classifier",
    "bert_large":     "bert_classifier",
    "distilbert":     "bert_classifier",
    "roberta_base":   "bert_classifier",
    "gpt2":           "bert_classifier",
    "t5_small":       "bert_classifier",
    "albert_base":    "bert_classifier",
    "electra_small":  "bert_classifier",
    "wav2vec2":       "audio_cnn_1d",
    "whisper_small":  "audio_cnn_1d",
    "custom":         "resnet18",
}


def resolve_architecture(name: str) -> str:
    """Resolve any catalogue ID to a FL-safe MODEL_REGISTRY key."""
    if name in MODEL_REGISTRY:
        return name
    resolved=ARCHITECTURE_ALIASES.get(name, "resnet18")
    if name!=resolved:
        import logging
        logging.getLogger(__name__).info(
            f"[models] Architecture '{name}' †’ '{resolved}' (FL-safe alias)"
        )
    return resolved


MODEL_REGISTRY: Dict[str, type]={
    "resnet18":         ResNet18,
    "mobilenetv2":      MobileNetV2,
    "efficientnet_b0":  EfficientNetB0,
    "vit_small":        ViTSmall,
    "bert_classifier":  SimpleBERTClassifier,
    "audio_cnn_1d":     AudioCNN1D,
    "tinynet":          TinyNet,
}


def create_model(architecture: str, num_classes: int=10, **kwargs) -> nn.Module:
    """
    Create a model and tag it with ._architecture/._num_classes.
    These tags let the FL client detect num_classes mismatches at fit() time
    and rebuild only the head  preventing the shape-mismatch crash.
    """
    architecture=resolve_architecture(architecture)
    model=MODEL_REGISTRY[architecture](num_classes=num_classes, **kwargs)

    model._architecture=architecture
    model._num_classes=num_classes
    return model


def get_canonical_input_size(architecture: str) -> Tuple[int, int]:
    """Return (H, W) the client should resize images to for this architecture."""
    return ARCHITECTURE_INPUT_SIZES.get(architecture, (224, 224))


def get_model_param_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def get_model_summary(architecture: str, num_classes: int=10) -> Dict[str, Any]:
    model=create_model(architecture, num_classes)
    params=get_model_param_count(model)
    return {
        "architecture": architecture,
        "num_classes":  num_classes,
        "parameters":   params,
        "parameters_millions": round(params/1e6, 2),
        "canonical_input_size": get_canonical_input_size(architecture),
    }
