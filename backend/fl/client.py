"""
AetherNet FL  Flower Client
==============================
KEY FIXES vs original:
  1. get_properties() now reports BOTH data_shape AND num_classes.
     The server reads num_classes from the first client and initialises the
     global model with the correct head size  eliminating the shape-mismatch
     crash ("size mismatch for fc.weight/fc.bias").

  2. load_local_data() resizes every image to the architecture's canonical
     input size (from models.ARCHITECTURE_INPUT_SIZES) regardless of the raw
     pixel dimensions in the dataset.  Raw images of any resolution (e.g.
     800Ã—600 betel disease photos) are handled transparently.

  3. Image glob now covers .jpg .jpeg .JPG .JPEG .png .PNG .bmp .webp so
     no images are silently skipped.

  4. fit() no longer tries to rebuild the model from scratch  the model is
     already built with the correct num_classes because the server reads it
     from get_properties() before sending initial weights.
"""

import argparse
import logging
import os
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import flwr as fl
import torch

logger=logging.getLogger(__name__)



def _count_classes(data_dir: str) -> int:
    """Count class subdirectories without loading any images."""
    data_path=Path(data_dir)
    if not data_path.exists():
        return 0
    return len([d for d in data_path.iterdir() if d.is_dir()])


def load_local_data(data_dir: str, target_hw: Tuple[int, int]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Load images from an ImageFolder-style directory.

    Args:
        data_dir  : root folder; each subfolder=one class.
        target_hw : (H, W) to resize every image to  must match the
                    architecture's canonical input size.

    Returns:
        X_train : float32 array of shape (N, 3, H, W)
        y_train : int64  array of shape (N,)
    """
    from PIL import Image

    data_path=Path(data_dir)
    if not data_path.exists():
        raise ValueError(
            f"Dataset directory not found: '{data_dir}'\n"
            "Expected structure:\n"
            "  <data_dir>/<class_name>/<image>.jpg\n"
        )

    class_dirs=sorted([d for d in data_path.iterdir() if d.is_dir()])
    if not class_dirs:
        raise ValueError(
            f"No class subdirectories found in '{data_dir}'.\n"
            "Each subdirectory name is treated as a class label."
        )

    h, w=target_hw
    logger.info(f"[Dataset] {len(class_dirs)} classes in '{data_dir}', resizing to {h}Ã—{w}")

    EXTS={".jpg", ".jpeg", ".png", ".bmp", ".webp", ".JPG", ".JPEG", ".PNG", ".BMP", ".WEBP"}
    X, y=[], []

    for label_idx, class_dir in enumerate(class_dirs):
        imgs=[p for p in class_dir.iterdir() if p.suffix in EXTS]
        if not imgs:
            logger.warning(f"[Dataset] No supported images in '{class_dir.name}', skipping.")
            continue
        for img_path in imgs:
            try:
                arr=np.array(
                    Image.open(img_path).convert("RGB").resize((w, h)),
                    dtype=np.float32,
                )/255.0
                X.append(arr.transpose(2, 0, 1))   # HWC †’ CHW
                y.append(label_idx)
            except Exception as exc:
                logger.warning(f"[Dataset] Skipping '{img_path.name}': {exc}")

    if not X:
        raise ValueError(
            f"No valid images loaded from '{data_dir}'.\n"
            "Supported formats: jpg, jpeg, png, bmp, webp"
        )

    logger.info(f"[Dataset] Loaded {len(X)} images across {len(class_dirs)} classes")
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.int64)



def set_weights(model: torch.nn.Module, parameters: List[np.ndarray]) -> None:
    state={k: torch.tensor(v) for k, v in zip(model.state_dict().keys(), parameters)}
    model.load_state_dict(state, strict=True)


def get_weights(model: torch.nn.Module) -> List[np.ndarray]:
    return [v.cpu().numpy() for v in model.state_dict().values()]


def load_local_model(num_classes: int, architecture: str="resnet18") -> torch.nn.Module:
    """Create model with the CORRECT num_classes from the start."""
    from fl.models import create_model
    model=create_model(architecture, num_classes=num_classes)
    logger.info(
        f"[Model] {architecture} | num_classes={num_classes} | "
        f"params={sum(p.numel() for p in model.parameters()):,}"
    )
    return model



class AetherNetClient(fl.client.NumPyClient):
    """
    Flower client that:
      1. Counts dataset classes locally and reports num_classes + data_shape
         in get_properties()  the server uses this to init the global model.
      2. Resizes images to the architecture's canonical size on load.
      3. Trains locally; only weight updates leave the machine.
    """

    def __init__(
        self,
        data_shape: List[int],
        architecture: str,
        session_key: str,
        data_dir: str,
    ):
        from fl.models import get_canonical_input_size

        self.data_shape=data_shape
        self.architecture=architecture
        self.session_key=session_key
        self.data_dir=data_dir
        self.device=torch.device("cuda" if torch.cuda.is_available() else "cpu")

        self.target_hw=get_canonical_input_size(architecture)

        self.num_classes=max(1, _count_classes(data_dir))

        self.model=load_local_model(self.num_classes, architecture).to(self.device)

        logger.info(
            f"[AetherNetClient] arch={architecture} num_classes={self.num_classes} "
            f"shape={data_shape} resize_to={self.target_hw} session={session_key} device={self.device}"
        )


    def get_properties(self, config: dict) -> Dict[str, fl.common.Scalar]:
        """
        Called by ValidationStrategy before fit().
        Reports data_shape AND num_classes so the server can:
          (a) validate input shape compatibility
          (b) initialise the global model with the correct head size
        """
        return {
            "data_shape": str(self.data_shape),
            "num_classes": str(self.num_classes),
        }

    def get_parameters(self, config: dict) -> List[np.ndarray]:
        return get_weights(self.model)

    def fit(self, parameters: List[np.ndarray], config: dict) -> Tuple[List[np.ndarray], int, dict]:
        """
        Receive global weights †’ train locally †’ return updated weights.
        The server initialised the global model with the num_classes this
        client reported in get_properties(), so set_weights() is safe.
        """
        set_weights(self.model, parameters)

        try:
            X_train, y_train=load_local_data(self.data_dir, self.target_hw)
        except (ValueError, ImportError) as exc:
            logger.error("[FL Client] Failed to load data: %s", exc)
            raise

        epochs=int(config.get("local_epochs", 1))
        batch_size=int(config.get("batch_size", 16))

        dataset=torch.utils.data.TensorDataset(
            torch.tensor(X_train), torch.tensor(y_train)
        )
        loader=torch.utils.data.DataLoader(dataset, batch_size=batch_size, shuffle=True)

        self.model.train()
        optimizer=torch.optim.Adam(self.model.parameters(), lr=1e-3)
        criterion=torch.nn.CrossEntropyLoss()
        total_loss=0.0

        for _ in range(epochs):
            for inputs, targets in loader:
                inputs, targets=inputs.to(self.device), targets.to(self.device)
                optimizer.zero_grad()
                loss=criterion(self.model(inputs), targets)
                loss.backward()
                optimizer.step()
                total_loss+=loss.item()

        avg_loss=total_loss/max(len(loader)*epochs, 1)
        logger.info("[FL Client] fit done  %d samples, loss=%.4f", len(X_train), avg_loss)
        return get_weights(self.model), len(X_train), {"local_loss": avg_loss}

    def evaluate(self, parameters: List[np.ndarray], config: dict) -> Tuple[float, int, dict]:
        try:
            X_val, y_val=load_local_data(self.data_dir, self.target_hw)
        except (ValueError, ImportError):
            return 1.0, 1, {"accuracy": 0.0}

        set_weights(self.model, parameters)
        self.model.eval()

        batch_size=int(config.get("batch_size", 16))
        dataset=torch.utils.data.TensorDataset(
            torch.tensor(X_val), torch.tensor(y_val)
        )
        loader=torch.utils.data.DataLoader(dataset, batch_size=batch_size)

        total_loss, correct=0.0, 0
        criterion=torch.nn.CrossEntropyLoss()
        with torch.no_grad():
            for inputs, targets in loader:
                inputs, targets=inputs.to(self.device), targets.to(self.device)
                out=self.model(inputs)
                total_loss+=criterion(out, targets).item()
                correct+=(out.argmax(1)==targets).sum().item()

        return total_loss/max(len(loader), 1), len(X_val), {"accuracy": correct/len(X_val)}



def start_client(
    server_address: str,
    data_shape: List[int],
    session_key: str,
    data_dir: str="./dataset",
    architecture: str="resnet18",
):
    client=AetherNetClient(
        data_shape=data_shape,
        architecture=architecture,
        session_key=session_key,
        data_dir=data_dir,
    )
    GRPC_MAX_MSG=1_500_000_000  # 1.5 GB  fits C long (max ~2.1 GB); 2 GB overflows
    logger.info(f"[FL Client] Connecting to {server_address} €¦")
    fl.client.start_client(
        server_address=server_address,
        client=client.to_client(),
        grpc_max_message_length=GRPC_MAX_MSG,
    )


if __name__=="__main__":
    parser=argparse.ArgumentParser(description="AetherNet Flower Client")
    parser.add_argument("--server",       default="127.0.0.1:8080")
    parser.add_argument("--session-key",  required=True)
    parser.add_argument("--data-shape",   default="3,224,224")
    parser.add_argument("--data-dir",     default="./dataset")
    parser.add_argument("--architecture", default="resnet18")
    args=parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s  %(message)s")
    shape=[int(x) for x in args.data_shape.split(",")]
    start_client(
        server_address=args.server,
        data_shape=shape,
        session_key=args.session_key,
        data_dir=args.data_dir,
        architecture=args.architecture,
    )
