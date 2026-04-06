"""
AetherNet FL  PubSub Event Bus (SSE-compatible)
A simple asyncio-based event bus used to publish Flower server events to the FastAPI SSE endpoint.
"""

import asyncio
import json
import logging
from typing import AsyncGenerator, Any
from datetime import datetime, timezone

logger=logging.getLogger(__name__)


class EventBus:
    """
    In-memory asyncio pub/sub bus.
    The Flower server publishes events; the FastAPI SSE endpoint subscribes and
    streams them to the browser.
    """

    def __init__(self):
        self._subscribers: list[asyncio.Queue]=[]

    async def publish(self, event_type: str, data: Any):
        """Broadcast an event to all current subscribers."""
        payload={
            "type": event_type,
            "data": json.dumps(data) if not isinstance(data, str) else data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        dead=[]
        for queue in self._subscribers:
            try:
                await queue.put(payload)
            except Exception:
                dead.append(queue)

        for q in dead:
            self._subscribers.remove(q)

        logger.debug(f"[EventBus] Published: {event_type}")

    async def subscribe(self) -> AsyncGenerator[dict, None]:
        """Async generator  yields events as they arrive."""
        queue: asyncio.Queue=asyncio.Queue(maxsize=100)
        self._subscribers.append(queue)
        logger.info(f"[EventBus] New subscriber. Total: {len(self._subscribers)}")
        try:
            while True:
                event=await queue.get()
                yield event
        except asyncio.CancelledError:
            pass
        finally:
            if queue in self._subscribers:
                self._subscribers.remove(queue)
            logger.info(f"[EventBus] Subscriber disconnected. Total: {len(self._subscribers)}")


event_bus=EventBus()
