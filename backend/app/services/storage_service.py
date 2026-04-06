"""
ModelMesh Backend  Pinata/IPFS Storage Service
Handles file uploads and JSON pinning to Pinata's IPFS gateway.
"""

import httpx
import logging
from typing import Optional
from app.core.config import get_settings

logger=logging.getLogger(__name__)
settings=get_settings()

PINATA_PIN_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS"
PINATA_PIN_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS"
PINATA_UNPIN_URL    = "https://api.pinata.cloud/pinning/unpin/"


def _auth_headers() -> dict:
    """Returns Pinata auth headers. Prefers JWT over API key/secret."""
    if settings.pinata_jwt:
        return {"Authorization": f"Bearer {settings.pinata_jwt}"}
    return {
        "pinata_api_key":    settings.pinata_api_key,
        "pinata_api_secret": settings.pinata_api_secret,
    }


async def upload_file_to_pinata(
    file_bytes: bytes,
    filename:   str,
    metadata:   Optional[dict]=None,
) -> str:
    """
    Upload a file (e.g. model weights .pt/.pkl) to Pinata IPFS.

    Args:
        file_bytes: Raw bytes of the file.
        filename:   Desired filename on IPFS.
        metadata:   Optional Pinata metadata dict (name, keyvalues).

    Returns:
        CID (IPFS content identifier) string.

    Raises:
        RuntimeError on upload failure.
    """
    import json

    pinata_metadata={"name": filename}
    if metadata:
        pinata_metadata.update(metadata)

    async with httpx.AsyncClient(timeout=120.0) as client:
        response=await client.post(
            PINATA_PIN_FILE_URL,
            headers=_auth_headers(),
            files={"file": (filename, file_bytes, "application/octet-stream")},
            data={"pinataMetadata": json.dumps(pinata_metadata)},
        )

    if response.status_code!=200:
        logger.error(f"Pinata upload failed: {response.text}")
        raise RuntimeError(f"Pinata upload failed: {response.status_code}  {response.text}")

    cid=response.json()["IpfsHash"]
    logger.info(f"Uploaded '{filename}' to Pinata. CID: {cid}")
    return cid


async def pin_json_to_pinata(data: dict, name: str="metadata") -> str:
    """
    Pin a JSON object to Pinata IPFS (for model recipes, metrics, etc.).

    Returns:
        CID string.
    """
    payload={
        "pinataContent": data,
        "pinataMetadata": {"name": name},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        response=await client.post(
            PINATA_PIN_JSON_URL,
            headers={**_auth_headers(), "Content-Type": "application/json"},
            json=payload,
        )

    if response.status_code!=200:
        logger.error(f"Pinata JSON pin failed: {response.text}")
        raise RuntimeError(f"Pinata JSON pin failed: {response.status_code}  {response.text}")

    cid=response.json()["IpfsHash"]
    logger.info(f"Pinned JSON '{name}' to Pinata. CID: {cid}")
    return cid


async def unpin_from_pinata(cid: str) -> bool:
    """Remove a pin from Pinata (does NOT delete from IPFS network)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response=await client.delete(
            PINATA_UNPIN_URL + cid,
            headers=_auth_headers(),
        )
    return response.status_code==200


def get_gateway_url(cid: str) -> str:
    """Return the public IPFS gateway URL for a given CID."""
    return f"{settings.pinata_gateway}{cid}"
