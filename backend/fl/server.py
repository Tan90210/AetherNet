"""
AetherNet FL  Flower Server with ValidationStrategy (Ouster Logic)

The ValidationStrategy inherits from FedAvg and overrides configure_fit to:
 1. Query each client for its 'data_shape' property.
 2. Compare against the session's required_input_shape.
 3. Immediately drop ('oust') clients whose shapes do not match.
 4. Publish SSE events to the frontend via event_bus for every significant action.
"""

import asyncio
import logging
import threading
import numpy as np
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple, Union

import flwr as fl
from flwr.common import (
    FitIns,
    FitRes,
    Parameters,
    Scalar,
    ndarrays_to_parameters,
    parameters_to_ndarrays,
)
from flwr.server.client_manager import ClientManager
from flwr.server.client_proxy import ClientProxy
from flwr.server.strategy import FedAvg

logger=logging.getLogger(__name__)

_loop: Optional[asyncio.AbstractEventLoop]=None


def set_event_loop(loop: asyncio.AbstractEventLoop):
    global _loop
    _loop=loop


def _publish(event_type: str, data: dict):
    """Thread-safe bridge: publish from sync Flower callbacks to async event bus."""
    if _loop is None:
        return
    try:
        from fl.pubsub import event_bus
        asyncio.run_coroutine_threadsafe(event_bus.publish(event_type, data), _loop)
    except Exception as exc:
        logger.warning(f"[publish] Failed to emit {event_type}: {exc}")


def _persist_round_progress(session_key: str, server_round: int):
    """
    Persist round/member progress using synchronous PyMongo.
    Motor is bound to the FastAPI event loop; Flower callbacks run in a
    different thread with its own loop †’ 'Future attached to a different loop'.
    Plain PyMongo has no event loop dependency and is safe to call here.
    """
    try:
        from pymongo import MongoClient
        from app.core.config import get_settings
        settings=get_settings()
        col=MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5_000)[
            settings.mongodb_db_name
        ]["sessions"]

        doc=col.find_one(
            {"session_key": session_key},
            {"participants": 1, "member_progress": 1},
        )
        if not doc:
            return

        participants=doc.get("participants", []) or []
        progress=doc.get("member_progress", {}) or {}
        now=datetime.now(timezone.utc)

        for participant in participants:
            name=participant.get("username") or participant.get("user_id") or "unknown"
            prev=progress.get(name, {}) or {}
            prev_rounds=int(prev.get("rounds_completed", 0) or 0)
            progress[name]={
                "status": "training",
                "rounds_completed": max(prev_rounds, int(server_round)),
                "last_update": now,
            }

        col.update_one(
            {"session_key": session_key},
            {"$set": {
                "current_round": int(server_round),
                "member_progress": progress,
                "updated_at": now,
            }},
        )
    except Exception as exc:
        logger.warning("Failed persisting round progress for %s: %s", session_key, exc)


class ValidationStrategy(FedAvg):
    """
    FedAvg with dataset-shape validation ("Ouster" strategy).

    Each client must include 'data_shape' in the properties it sends back
    after the GetPropertiesIns round. Any client reporting a shape that
    does not match this session's required_input_shape is immediately
    disconnected (ousted) and the event is broadcast via SSE.
    """

    def __init__(
        self,
        session_key: str,
        required_input_shape: List[int],
        *args,
        **kwargs,
    ):
        self._architecture: str=kwargs.pop("architecture", "resnet18")
        super().__init__(*args, **kwargs)
        self.session_key=session_key
        self.required_input_shape=required_input_shape
        self.last_aggregated_parameters: Optional[Parameters]=None
        self.last_aggregated_round: int=0
        self._resolved_num_classes: int=10  # placeholder
        logger.info(
            f"[ValidationStrategy] Session={session_key}  "
            f"Required shape={required_input_shape}  arch={self._architecture}"
        )


    def configure_fit(
        self,
        server_round: int,
        parameters: Parameters,
        client_manager: ClientManager,
    ) -> List[Tuple[ClientProxy, FitIns]]:
        """
        Override configure_fit to validate each client's reported data_shape.
        Clients with mismatched shapes are ousted (removed from the round).
        """
        _publish("round_start", {
            "session_key": self.session_key,
            "round": server_round,
            "message": f"Round {server_round} starting  validating clients¦",
        })

        client_instructions=super().configure_fit(
            server_round, parameters, client_manager
        )

        validated: List[Tuple[ClientProxy, FitIns]]=[]

        for client_proxy, fit_ins in client_instructions:
            fit_ins.config["expected_shape"]=str(self.required_input_shape)
            fit_ins.config["session_key"]=self.session_key

            try:
                props_res=client_proxy.get_properties(
                    fl.common.GetPropertiesIns(config={}),
                    timeout=30,
                    group_id=None,
                )
                client_shape_raw=props_res.properties.get("data_shape", "")
                client_shape=self._parse_shape(str(client_shape_raw))
                client_num_classes=int(props_res.properties.get("num_classes", 0) or 0)
            except Exception as exc:
                logger.warning(f"[Ouster] Could not get properties from client: {exc}")
                self._oust_client(client_proxy, "Failed to report properties")
                continue

            if client_shape!=self.required_input_shape:
                msg=(
                    f"Dataset mismatch  client reported shape {client_shape}, "
                    f"session requires {self.required_input_shape}"
                )
                logger.warning(f"[Ouster] {msg}")
                self._oust_client(client_proxy, msg)
                continue

            if client_num_classes>0:
                self._resolved_num_classes=client_num_classes

            logger.info(
                f"[ValidationStrategy] Client validated œ“ shape={client_shape} num_classes={client_num_classes}"
            )
            validated.append((client_proxy, fit_ins))

        _publish("clients_validated", {
            "session_key": self.session_key,
            "round": server_round,
            "accepted": len(validated),
            "total": len(client_instructions),
        })

        return validated

    def aggregate_fit(
        self,
        server_round: int,
        results: List[Tuple[ClientProxy, FitRes]],
        failures: List[Union[Tuple[ClientProxy, FitRes], BaseException]],
    ) -> Tuple[Optional[Parameters], Dict[str, Scalar]]:
        aggregated, metrics=super().aggregate_fit(server_round, results, failures)

        if aggregated is not None and len(results)>0:
            self.last_aggregated_parameters=aggregated
            self.last_aggregated_round=server_round

        if len(results)>0:
            _publish("round_end", {
                "session_key": self.session_key,
                "round": server_round,
                "participants": len(results),
                "failures": len(failures),
                "metrics": metrics,
            })
        else:
            _publish("round_no_updates", {
                "session_key": self.session_key,
                "round": server_round,
                "participants": 0,
                "failures": len(failures),
                "message": "No validated client updates received in this round.",
            })

        if len(results)>0:
            import threading as _threading
            _threading.Thread(
                target=_persist_round_progress,
                args=(self.session_key, server_round),
                daemon=True,
            ).start()

        return aggregated, metrics

    def evaluate(self, server_round: int, parameters: Parameters):
        result=super().evaluate(server_round, parameters)
        if result:
            loss, metrics=result
            _publish("evaluation", {
                "session_key": self.session_key,
                "round": server_round,
                "loss": loss,
                "metrics": metrics,
            })
        return result


    @staticmethod
    def _parse_shape(raw: str) -> List[int]:
        """Parse '[3, 224, 224]' †’ [3, 224, 224]."""
        try:
            cleaned=raw.strip().strip("[]").replace(" ", "")
            return [int(x) for x in cleaned.split(",") if x]
        except Exception:
            return []

    @staticmethod
    def _oust_client(client_proxy: ClientProxy, reason: str):
        """Log the ouster and publish SSE event. Flower will drop the client automatically
        since we simply don't include it in the returned list."""
        node_id=getattr(client_proxy, "node_id", "unknown")
        _publish("client_ousted", {
            "node_id": str(node_id),
            "reason": reason,
        })
        logger.warning(f"[Ouster] Client {node_id} ousted  {reason}")

class GradientValidationStrategy(ValidationStrategy):
    """
    Subclass of ValidationStrategy that also computes the L2 norm of the
    returned weights from each client. If a client's update is a statistical
    outlier (z-score>2.5), the client's update is discarded and it is ousted.
    """
    def aggregate_fit(
        self,
        server_round: int,
        results: List[Tuple[ClientProxy, FitRes]],
        failures: List[Union[Tuple[ClientProxy, FitRes], BaseException]],
    ) -> Tuple[Optional[Parameters], Dict[str, Scalar]]:

        if len(results)<2:
            return super().aggregate_fit(server_round, results, failures)

        norms=[]
        for _, fit_res in results:
            ndarrays=parameters_to_ndarrays(fit_res.parameters)
            norm=sum(np.linalg.norm(layer)**2 for layer in ndarrays) ** 0.5
            norms.append(norm)

        norms=np.array(norms)
        mean_norm=np.mean(norms)
        std_norm=np.std(norms)

        valid_results=[]

        for (client_proxy, fit_res), norm in zip(results, norms):
            if std_norm>0 and abs(norm - mean_norm)/std_norm>2.5:
                msg=f"Faulty data detected (Gradient Norm Z-Score: {abs(norm - mean_norm)/std_norm:.2f})"
                logger.warning(f"[GradientValidation] {msg}")
                self._oust_client(client_proxy, msg)
            else:
                valid_results.append((client_proxy, fit_res))

        return super().aggregate_fit(server_round, valid_results, failures)
