"""
AetherNet FL  Flower Server Entry Point
Starts the Flower server with the custom ValidationStrategy.
Bridges the async SSE event bus with the synchronous Flower callbacks.

FIXES:
  1. _assert_bindable used a fresh bind() test that ITSELF held the port,
     causing the real gRPC server to get EADDRINUSE and fail to start.
     Fixed: removed _assert_bindable entirely  port availability is already
     guaranteed by _pick_available_fl_port() in sessions.py before we get here.
  2. The server published "server_ready" BEFORE gRPC had actually bound the
     port, so clients spawned immediately and got ECONNREFUSED.
     Fixed: clients now wait via a simple retry-connect loop instead of a
     blind time.sleep(5), guaranteeing the server is up before connecting.
"""

import argparse
import asyncio
import logging
import sys
import os
import socket
import time
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import flwr as fl
from flwr.common import parameters_to_ndarrays
from fl.server import ValidationStrategy, GradientValidationStrategy, set_event_loop
from fl.pubsub import event_bus
from app.core.config import get_settings as _get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s  %(message)s",
)
logger=logging.getLogger(__name__)
ARTIFACTS_DIR=os.path.join(os.path.dirname(__file__), "artifacts")


def _get_sync_sessions_col():
    """
    Return a synchronous PyMongo collection.
    Motor is bound to the FastAPI event loop; run_server runs on its own
    loop in a daemon thread, so Motor calls raise 'Future attached to a
    different loop'. Plain PyMongo has no event loop dependency.
    """
    from pymongo import MongoClient
    settings=_get_settings()
    client=MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=10_000)
    return client[settings.mongodb_db_name]["sessions"]


def _persist_training_artifact_sync(session_key: str, strategy: ValidationStrategy, loop) -> None:
    """Synchronous version  called from the FL background thread after training.
    DB writes use PyMongo (no event loop). SSE events use loop.run_until_complete()
    which is safe here because flower_thread.join() has already returned and
    the loop is idle.
    """
    now=datetime.now(timezone.utc)

    if getattr(strategy, "last_aggregated_parameters", None) is None:
        try:
            col=_get_sync_sessions_col()
            col.update_one(
                {"session_key": session_key},
                {"$set": {"final_model_artifact_path": None, "updated_at": now}},
            )
        except Exception as exc:
            logger.warning("[persist] DB update failed (no artifact): %s", exc)
        loop.run_until_complete(event_bus.publish("training_artifact_missing", {
            "session_key": session_key,
            "reason": "No aggregated model parameters were produced.",
        }))
        return

    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    round_num=int(getattr(strategy, "last_aggregated_round", 0) or 0)
    artifact_name=f"{session_key}_round_{round_num or 'final'}_weights.npz"
    artifact_path=os.path.join(ARTIFACTS_DIR, artifact_name)
    ndarrays=parameters_to_ndarrays(strategy.last_aggregated_parameters)
    np.savez_compressed(artifact_path, **{f"arr_{i}": arr for i, arr in enumerate(ndarrays)})

    try:
        col=_get_sync_sessions_col()
        col.update_one(
            {"session_key": session_key},
            {"$set": {"final_model_artifact_path": artifact_path, "updated_at": now}},
        )
    except Exception as exc:
        logger.warning("[persist] DB update failed (artifact path): %s", exc)

    loop.run_until_complete(event_bus.publish("training_artifact_ready", {
        "session_key": session_key,
        "artifact_path": artifact_path,
        "round": round_num,
    }))


def _mark_session_closed_sync(session_key: str, final_round: int) -> None:
    """Synchronous version  called from the FL background thread after training."""
    now=datetime.now(timezone.utc)
    try:
        col=_get_sync_sessions_col()
        doc=col.find_one({"session_key": session_key}, {"member_progress": 1})
        progress=(doc or {}).get("member_progress", {}) or {}
        for member_name, member in list(progress.items()):
            prev_rounds=int((member or {}).get("rounds_completed", 0) or 0)
            progress[member_name]={
                "status": "completed",
                "rounds_completed": max(prev_rounds, int(final_round or 0)),
                "last_update": now,
            }
        col.update_one(
            {"session_key": session_key},
            {"$set": {
                "status": "Closed",
                "current_round": int(final_round or 0),
                "member_progress": progress,
                "updated_at": now,
            }},
        )
    except Exception as exc:
        logger.warning("[persist] DB update failed (session closed): %s", exc)




def _wait_for_server_ready(host: str, port: int, timeout: float=30.0) -> bool:
    """
    FIX 2: Poll until the gRPC server is actually accepting connections.
    Returns True if server came up within timeout, False otherwise.
    This replaces the blind time.sleep(5) in _spawn_clients, eliminating
    the ECONNREFUSED race between client spawn and server bind.
    """
    check_host="127.0.0.1" if host in ("0.0.0.0", "::", "") else host
    deadline=time.monotonic() + timeout
    while time.monotonic()<deadline:
        try:
            sock=socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.5)
            sock.connect((check_host, port))
            sock.close()
            return True
        except (ConnectionRefusedError, OSError):
            time.sleep(0.5)
    return False


def run_server(
    session_key: str,
    required_input_shape: list,
    host: str="0.0.0.0",
    port: int=8080,
    num_rounds: int=3,
    min_clients: int=2,
    architecture: str="resnet18",
    **kwargs
):
    """
    Start the Flower FL server for a given session.
    An asyncio event loop is created so Flower's sync callbacks can publish
    to the async SSE event bus.
    """
    loop=asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    set_event_loop(loop)

    def _weighted_average(metrics):
        """Aggregate evaluation metrics weighted by number of examples."""
        accuracies=[n*m.get("accuracy", 0.0) for n, m in metrics]
        total=sum(n for n, _ in metrics)
        return {"accuracy": sum(accuracies)/total} if total>0 else {}

    strategy_kwargs=dict(
        session_key=session_key,
        required_input_shape=required_input_shape,
        min_fit_clients=min_clients,
        min_evaluate_clients=min_clients,
        min_available_clients=min_clients,
        architecture=architecture,
        evaluate_metrics_aggregation_fn=_weighted_average,
        initial_parameters=None,
    )

    if kwargs.get("policy")=="gradient_norm":
        strategy=GradientValidationStrategy(**strategy_kwargs)
    else:
        strategy=ValidationStrategy(**strategy_kwargs)

    server_address=f"{host}:{port}"
    logger.info(
        f"ðŸŒ¸ Starting Flower server\n"
        f"   Address  : {server_address}\n"
        f"   Session  : {session_key}\n"
        f"   Shape    : {required_input_shape}\n"
        f"   Rounds   : {num_rounds}\n"
        f"   Min clients: {min_clients}"
    )


    import threading

    server_exception=[]

    GRPC_MAX_MSG=1_500_000_000  # 1.5 GB  fits C long (max ~2.1 GB); 2 GB overflows

    def _run_flower():
        try:
            fl.server.start_server(
                server_address=server_address,
                config=fl.server.ServerConfig(num_rounds=num_rounds),
                strategy=strategy,
                grpc_max_message_length=GRPC_MAX_MSG,
            )
        except Exception as exc:
            server_exception.append(exc)

    flower_thread=threading.Thread(target=_run_flower, daemon=False)
    flower_thread.start()

    logger.info(f"³ Waiting for gRPC server to bind on port {port}¦")
    if not _wait_for_server_ready(host, port, timeout=30.0):
        err=server_exception[0] if server_exception else RuntimeError(
            f"FL server did not bind on port {port} within 30 seconds."
        )
        loop.run_until_complete(
            event_bus.publish("server_launch_failed", {
                "session_key": session_key,
                "error": str(err),
            })
        )
        raise err

    loop.run_until_complete(
        event_bus.publish("server_ready", {
            "session_key": session_key,
            "address": server_address,
            "rounds": num_rounds,
        })
    )
    logger.info(f"œ… gRPC server confirmed up on port {port}, published server_ready")

    flower_thread.join()

    if server_exception:
        raise server_exception[0]

    try:
        _persist_training_artifact_sync(session_key, strategy, loop)
    except Exception:
        logger.exception("Failed to persist training artifact for session %s", session_key)

    _mark_session_closed_sync(session_key, int(getattr(strategy, "last_aggregated_round", 0) or 0))

    loop.run_until_complete(
        event_bus.publish("session_closed", {
            "session_key": session_key,
            "message": "All rounds complete. Creator can now publish final model.",
        })
    )

    logger.info("œ… FL training complete.")


if __name__=="__main__":
    parser=argparse.ArgumentParser(description="AetherNet Flower FL Server")
    parser.add_argument("--session-key", required=True, help="Unique session key")
    parser.add_argument(
        "--shape",
        default="3,224,224",
        help="Required client data shape (comma-separated), e.g. 3,224,224",
    )
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--min-clients", type=int, default=2)
    parser.add_argument("--policy", default="shape_only", help="Validation policy")
    args=parser.parse_args()

    shape=[int(x) for x in args.shape.split(",")]
    run_server(
        session_key=args.session_key,
        required_input_shape=shape,
        host=args.host,
        port=args.port,
        num_rounds=args.rounds,
        min_clients=args.min_clients,
        policy=args.policy,
    )
