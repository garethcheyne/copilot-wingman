"""SSE stream parser for Wingman chat responses."""

from __future__ import annotations

import json
from typing import Any, Dict, Iterator, Mapping, Optional

import httpx

from .errors import APIError, WingmanError


ChatStreamChunk = Dict[str, Any]


class Stream:
    """Iterable wrapper over an SSE response body.

    Yields parsed JSON objects (one per SSE frame). The `[DONE]` sentinel
    terminates iteration. `event: error` frames raise an `APIError`.
    """

    def __init__(self, response: httpx.Response) -> None:
        self._response = response
        self._consumed = False

    def __iter__(self) -> Iterator[ChatStreamChunk]:
        if self._consumed:
            raise WingmanError(
                "Cannot iterate a consumed stream; issue a new request to stream again."
            )
        self._consumed = True

        try:
            buffer = ""
            for raw in self._response.iter_text():
                if not raw:
                    continue
                buffer += raw
                while True:
                    sep = buffer.find("\n\n")
                    if sep == -1:
                        break
                    frame = buffer[:sep]
                    buffer = buffer[sep + 2 :]
                    event = self._parse_frame(frame)
                    if event is None:
                        continue
                    event_name, data = event
                    if data == "[DONE]":
                        return
                    if event_name == "error":
                        try:
                            parsed: Any = json.loads(data)
                        except json.JSONDecodeError:
                            parsed = data
                        raise APIError.generate(
                            None,
                            parsed if isinstance(parsed, Mapping) else data,
                            "Stream error",
                            dict(self._response.headers),
                        )
                    try:
                        yield json.loads(data)
                    except json.JSONDecodeError:
                        yield {"content": data}  # fallback
        finally:
            self.close()

    @staticmethod
    def _parse_frame(frame: str) -> Optional[tuple[Optional[str], str]]:
        event_name: Optional[str] = None
        data_lines: list[str] = []
        for raw_line in frame.split("\n"):
            line = raw_line.rstrip("\r")
            if not line or line.startswith(":"):
                continue
            colon = line.find(":")
            if colon == -1:
                field, value = line, ""
            else:
                field = line[:colon]
                value = line[colon + 1 :]
                if value.startswith(" "):
                    value = value[1:]
            if field == "event":
                event_name = value
            elif field == "data":
                data_lines.append(value)
        if not data_lines:
            return None
        return event_name, "\n".join(data_lines)

    def text_deltas(self) -> Iterator[str]:
        """Yield only the incremental text deltas from each chunk."""
        for chunk in self:
            delta = (
                (chunk.get("choices") or [{}])[0].get("delta", {}).get("content")
                if isinstance(chunk.get("choices"), list)
                else None
            )
            if delta:
                yield delta

    def close(self) -> None:
        try:
            self._response.close()
        except Exception:
            pass

    def __enter__(self) -> "Stream":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()
