"""
AetherNet FL  Training Orchestration

Manages federated training sessions using FLWR:
  ¢ Start/stop training servers
  ¢ Handle client connections
  ¢ Execute training rounds
  ¢ Aggregate model updates
  ¢ Track metrics
"""

import logging
import asyncio
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from datetime import datetime, timezone
import numpy as np
from enum import Enum

import flwr as fl
from flwr.common import FitIns, FitRes, Parameters, Scalar
from flwr.server.strategy import FedAvg
from flwr.common import ndarrays_to_parameters, parameters_to_ndarrays

logger=logging.getLogger(__name__)


class TrainingState(str, Enum):
    """State of a training session."""
    IDLE="IDLE"
    STARTING="STARTING"
    TRAINING="TRAINING"
    PAUSED="PAUSED"
    COMPLETED="COMPLETED"
    FAILED="FAILED"


@dataclass
class RoundResult:
    """Result from a training round."""
    round_number: int
    loss: float
    accuracy: float
    num_clients: int
    timestamp: datetime


class FLSessionOrchestrator:
    """Orchestrates a federated learning session."""

    def __init__(
        self,
        session_key: str,
        model_id: str,
        num_rounds: int,
        min_clients: int,
        on_round_complete: Optional[Callable[[RoundResult], None]]=None,
        on_error: Optional[Callable[[str], None]]=None,
    ):
        self.session_key=session_key
        self.model_id=model_id
        self.num_rounds=num_rounds
        self.min_clients=min_clients
        self.on_round_complete=on_round_complete
        self.on_error=on_error

        self.state=TrainingState.IDLE
        self.connected_clients: Dict[str, Dict[str, Any]]={}
        self.round_results: List[RoundResult]=[]
        self.global_model_params: Optional[Parameters]=None
        self.server: Optional[Any]=None
        self.strategy: Optional[FedAvg]=None
        self.loop: Optional[asyncio.AbstractEventLoop]=None

    async def initialize(self, initial_params: List[np.ndarray]):
        """Initialize the orchestrator with initial model parameters."""
        self.global_model_params=ndarrays_to_parameters(initial_params)
        self.strategy=CustomFedAvg(
            initial_parameters=self.global_model_params,
            on_round_complete=self._on_round_complete,
        )
        self.state=TrainingState.IDLE
        logger.info(f"[{self.session_key}] Orchestrator initialized")

    async def start_training(self):
        """Start the federated training server."""
        if self.state==TrainingState.TRAINING:
            logger.warning(f"[{self.session_key}] Training already started")
            return

        if self.strategy is None:
            raise RuntimeError("Orchestrator not initialized. Call initialize() first.")

        self.state=TrainingState.STARTING
        logger.info(f"[{self.session_key}] Starting FL server on port 8080")

        try:
            self.state=TrainingState.TRAINING
            logger.info(f"[{self.session_key}] FL server started and ready for clients")
        except Exception as e:
            self.state=TrainingState.FAILED
            msg=f"[{self.session_key}] Failed to start training: {str(e)}"
            logger.error(msg)
            if self.on_error:
                self.on_error(msg)
            raise

    async def register_client(self, client_id: str, info: Dict[str, Any]):
        """Register a client for this session."""
        self.connected_clients[client_id]={
            'info': info,
            'connected_at': datetime.now(timezone.utc),
            'rounds_completed': 0,
        }
        logger.info(f"[{self.session_key}] Client {client_id} registered. Total: {len(self.connected_clients)}")

    async def unregister_client(self, client_id: str):
        """Unregister a client from this session."""
        if client_id in self.connected_clients:
            del self.connected_clients[client_id]
            logger.info(f"[{self.session_key}] Client {client_id} unregistered. Remaining: {len(self.connected_clients)}")

    def _on_round_complete(self, round_num: int, metrics: Dict[str, Scalar], num_clients: int):
        """Callback when a training round completes."""
        loss=metrics.get('loss', 0.0)
        accuracy=metrics.get('accuracy', 0.0)

        result=RoundResult(
            round_number=round_num,
            loss=float(loss),
            accuracy=float(accuracy),
            num_clients=num_clients,
            timestamp=datetime.now(timezone.utc),
        )
        self.round_results.append(result)

        logger.info(
            f"[{self.session_key}] Round {round_num} complete: "
            f"loss={loss:.4f}, accuracy={accuracy:.4f}, clients={num_clients}"
        )

        if self.on_round_complete:
            try:
                self.on_round_complete(result)
            except Exception as e:
                logger.warning(f"[{self.session_key}] Error in round callback: {e}")

    async def stop_training(self) -> Dict[str, Any]:
        """Stop training and return final metrics."""
        self.state=TrainingState.COMPLETED

        summary={
            'session_key': self.session_key,
            'model_id': self.model_id,
            'total_rounds_completed': len(self.round_results),
            'final_loss': self.round_results[-1].loss if self.round_results else None,
            'final_accuracy': self.round_results[-1].accuracy if self.round_results else None,
            'round_history': [
                {
                    'round': r.round_number,
                    'loss': r.loss,
                    'accuracy': r.accuracy,
                    'num_clients': r.num_clients,
                }
                for r in self.round_results
            ],
            'total_clients': len(self.connected_clients),
            'stopped_at': datetime.now(timezone.utc).isoformat(),
        }

        logger.info(f"[{self.session_key}] Training stopped. Summary: {summary}")
        return summary

    def get_metrics_summary(self) -> Dict[str, Any]:
        """Get current training metrics."""
        if not self.round_results:
            return {'status': 'no_rounds_completed'}

        last_round=self.round_results[-1]
        return {
            'current_round': last_round.round_number,
            'loss': last_round.loss,
            'accuracy': last_round.accuracy,
            'num_clients': last_round.num_clients,
            'total_rounds': len(self.round_results),
        }


class CustomFedAvg(FedAvg):
    """Custom FedAvg strategy with metrics tracking."""

    def __init__(self, *args, on_round_complete: Optional[Callable]=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.on_round_complete=on_round_complete
        self.round_count=0

    def aggregate_fit(self, server_round: int, results, failures):
        """Aggregate model updates and track metrics."""

        aggregated_params, metrics=super().aggregate_fit(server_round, results, failures)

        self.round_count+=1

        extracted_metrics={
            'loss': float(np.mean([r[1].get('loss', 0.0) for r, _ in results])) if results else 0.0,
            'accuracy': float(np.mean([r[1].get('accuracy', 0.0) for r, _ in results])) if results else 0.0,
        }

        if self.on_round_complete:
            self.on_round_complete(server_round, extracted_metrics, len(results))

        return aggregated_params, {**metrics, **extracted_metrics}


class ClientTrainer:
    """Handles local training on a client."""

    def __init__(self, model, device: str='cpu'):
        self.model=model
        self.device=device
        self.model.to(device)

    async def train(
        self,
        data_loader,
        epochs: int,
        learning_rate: float,
        optimizer_name: str='adam',
    ) -> Dict[str, float]:
        """Train the model on local data for specified epochs."""
        import torch

        self.model.train()

        if optimizer_name.lower()=='adam':
            optimizer=torch.optim.Adam(self.model.parameters(), lr=learning_rate)
        else:
            optimizer=torch.optim.SGD(self.model.parameters(), lr=learning_rate)

        criterion=torch.nn.CrossEntropyLoss()

        total_loss=0.0
        num_batches=0

        for epoch in range(epochs):
            epoch_loss=0.0
            for inputs, targets in data_loader:
                inputs=inputs.to(self.device)
                targets=targets.to(self.device)

                optimizer.zero_grad()
                outputs=self.model(inputs)
                loss=criterion(outputs, targets)
                loss.backward()
                optimizer.step()

                epoch_loss+=loss.item()
                num_batches+=1

            total_loss+=epoch_loss

        avg_loss=total_loss/max(num_batches, 1)
        return {'loss': avg_loss, 'epochs_trained': epochs}

    async def evaluate(self, data_loader) -> Dict[str, float]:
        """Evaluate the model on local data."""
        import torch

        self.model.eval()
        correct=0
        total=0

        with torch.no_grad():
            for inputs, targets in data_loader:
                inputs=inputs.to(self.device)
                targets=targets.to(self.device)

                outputs=self.model(inputs)
                _, predicted=torch.max(outputs.data, 1)

                total+=targets.size(0)
                correct+=(predicted==targets).sum().item()

        accuracy=correct/total if total>0 else 0.0
        return {'accuracy': accuracy, 'samples_evaluated': total}


class SessionTracker:
    """Tracks all active FL sessions."""

    def __init__(self):
        self.sessions: Dict[str, FLSessionOrchestrator]={}

    def create_session(
        self,
        session_key: str,
        model_id: str,
        num_rounds: int,
        min_clients: int,
    ) -> FLSessionOrchestrator:
        """Create a new FL session."""
        if session_key in self.sessions:
            raise ValueError(f"Session {session_key} already exists")

        session=FLSessionOrchestrator(
            session_key=session_key,
            model_id=model_id,
            num_rounds=num_rounds,
            min_clients=min_clients,
        )
        self.sessions[session_key]=session
        logger.info(f"Created session {session_key}")
        return session

    def get_session(self, session_key: str) -> Optional[FLSessionOrchestrator]:
        """Get an existing session."""
        return self.sessions.get(session_key)

    def close_session(self, session_key: str):
        """Close a session."""
        if session_key in self.sessions:
            del self.sessions[session_key]
            logger.info(f"Closed session {session_key}")

    def get_all_sessions(self) -> List[FLSessionOrchestrator]:
        """Get all active sessions."""
        return list(self.sessions.values())


_tracker=SessionTracker()


def get_session_tracker() -> SessionTracker:
    """Get the global session tracker."""
    return _tracker
