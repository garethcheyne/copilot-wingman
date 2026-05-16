from __future__ import annotations

from typing import Any, Dict, List

from .health import APIResource

ModelInfo = Dict[str, Any]


class Models(APIResource):
    def list(self) -> List[ModelInfo]:
        """GET /api/models — returns a normalized list of model descriptors."""
        raw = self._client.get("/api/models")
        items: List[Any]
        if isinstance(raw, list):
            items = raw
        elif isinstance(raw, dict):
            if isinstance(raw.get("data"), list):
                items = raw["data"]
            elif isinstance(raw.get("models"), list):
                items = raw["models"]
            else:
                items = []
        else:
            items = []
        return [self._normalize(x) for x in items]

    @staticmethod
    def _normalize(item: Any) -> ModelInfo:
        if isinstance(item, str):
            return {"id": item}
        if isinstance(item, dict):
            ident = item.get("id") or item.get("name") or item.get("model") or "(unknown)"
            return {**item, "id": ident}
        return {"id": "(unknown)"}
