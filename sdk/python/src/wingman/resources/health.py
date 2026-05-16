from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict

if TYPE_CHECKING:
    from ..client import Wingman


HealthResponse = Dict[str, Any]


class APIResource:
    def __init__(self, client: "Wingman") -> None:
        self._client = client


class Health(APIResource):
    def check(self) -> HealthResponse:
        """GET /api/health"""
        return self._client.get("/api/health")
