from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterator, List, Optional, Union

from .health import APIResource
from ..stream import Stream, ChatStreamChunk

ChatStreamChunk = ChatStreamChunk  # re-export


@dataclass
class ChatResponse:
    """Non-streaming response from POST /api/chat."""

    session_id: str
    message: str
    raw: Dict[str, Any]

    @classmethod
    def _from_payload(cls, payload: Dict[str, Any]) -> "ChatResponse":
        return cls(
            session_id=str(payload.get("sessionId", "")),
            message=str(payload.get("message", "")),
            raw=payload,
        )


class Chat(APIResource):
    def create(
        self,
        *,
        session_key: str,
        message: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        images: Optional[List[str]] = None,
        stream: bool = False,
    ) -> Union[ChatResponse, Stream]:
        """POST /api/chat — non-streaming returns `ChatResponse`, streaming returns `Stream`."""
        body: Dict[str, Any] = {"sessionKey": session_key, "message": message}
        if system_prompt is not None:
            body["systemPrompt"] = system_prompt
        if model is not None:
            body["model"] = model
        if images is not None:
            body["images"] = images
        if stream:
            body["stream"] = True
            return self._client.post_stream("/api/chat", body)
        body["stream"] = False
        payload = self._client.post("/api/chat", body)
        if not isinstance(payload, dict):
            raise TypeError(f"Unexpected chat response: {type(payload).__name__}")
        return ChatResponse._from_payload(payload)

    def stream(
        self,
        *,
        session_key: str,
        message: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        images: Optional[List[str]] = None,
    ) -> Stream:
        """Convenience wrapper that always returns a `Stream`."""
        result = self.create(
            session_key=session_key,
            message=message,
            system_prompt=system_prompt,
            model=model,
            images=images,
            stream=True,
        )
        assert isinstance(result, Stream)
        return result

    def stream_text(
        self,
        *,
        session_key: str,
        message: str,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        images: Optional[List[str]] = None,
    ) -> Iterator[str]:
        """Iterate only the text deltas from a streaming chat call."""
        with self.stream(
            session_key=session_key,
            message=message,
            system_prompt=system_prompt,
            model=model,
            images=images,
        ) as s:
            yield from s.text_deltas()
