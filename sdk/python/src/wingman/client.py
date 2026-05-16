"""Wingman client engine."""

from __future__ import annotations

import json
import os
import random
import time
from email.utils import parsedate_to_datetime
from typing import Any, Mapping, Optional

import httpx

from .errors import (
    APIConnectionError,
    APIConnectionTimeoutError,
    APIError,
)
from .stream import Stream
from .version import __version__

DEFAULT_TIMEOUT = 60.0
DEFAULT_MAX_RETRIES = 2


class Wingman:
    """Synchronous Wingman client.

    Example
    -------
    >>> client = Wingman(api_key="wm_...")
    >>> client.health.check()
    {'status': 'healthy'}
    >>> client.chat.create(session_key="s1", message="hi").message
    'Hello!'
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        default_headers: Optional[Mapping[str, str]] = None,
        http_client: Optional[httpx.Client] = None,
    ) -> None:
        key = api_key or os.environ.get("WINGMAN_API_KEY")
        if not key:
            raise ValueError(
                "Wingman SDK: missing api_key. Pass Wingman(api_key='wm_...') "
                "or set WINGMAN_API_KEY in the environment."
            )
        resolved_base_url = base_url or os.environ.get("WINGMAN_BASE_URL")
        if not resolved_base_url:
            raise ValueError(
                "Wingman SDK: missing base_url. Pass Wingman(base_url='...') "
                "or set WINGMAN_BASE_URL in the environment."
            )
        self.api_key = key
        self.base_url = resolved_base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.default_headers = dict(default_headers or {})
        self._client = http_client or httpx.Client(timeout=timeout)
        self._owns_client = http_client is None

        # Resources — imported lazily to avoid cycle at module init.
        from .resources.health import Health
        from .resources.models import Models
        from .resources.chat import Chat

        self.health = Health(self)
        self.models = Models(self)
        self.chat = Chat(self)

    # -------- public verbs --------

    def get(self, path: str, **kwargs: Any) -> Any:
        return self._request_json("GET", path, **kwargs)

    def post(self, path: str, body: Any = None, **kwargs: Any) -> Any:
        return self._request_json("POST", path, body=body, **kwargs)

    def post_stream(self, path: str, body: Any, **kwargs: Any) -> Stream:
        """POST and return an SSE `Stream` wrapping the response."""
        response = self._send("POST", path, body=body, stream=True, **kwargs)
        return Stream(response)

    # -------- internals --------

    def _build_headers(self, extra: Optional[Mapping[str, str]], has_body: bool) -> dict[str, str]:
        headers = {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": f"wingman-sdk-python/{__version__}",
            "X-Wingman-SDK": f"python/{__version__}",
        }
        if has_body:
            headers["Content-Type"] = "application/json"
        headers.update(self.default_headers)
        if extra:
            headers.update(extra)
        return headers

    def _request_json(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
        timeout: Optional[float] = None,
    ) -> Any:
        response = self._send(method, path, body=body, headers=headers, timeout=timeout)
        try:
            ct = response.headers.get("content-type", "")
            if "application/json" in ct:
                return response.json()
            return response.text
        finally:
            response.close()

    def _send(
        self,
        method: str,
        path: str,
        *,
        body: Any = None,
        headers: Optional[Mapping[str, str]] = None,
        timeout: Optional[float] = None,
        stream: bool = False,
    ) -> httpx.Response:
        url = f"{self.base_url}{path if path.startswith('/') else '/' + path}"
        has_body = body is not None
        final_headers = self._build_headers(headers, has_body)
        timeout_val = timeout if timeout is not None else self.timeout
        content = json.dumps(body).encode("utf-8") if has_body else None

        last_exc: Optional[BaseException] = None
        for attempt in range(self.max_retries + 1):
            try:
                request = self._client.build_request(
                    method,
                    url,
                    headers=final_headers,
                    content=content,
                    timeout=timeout_val,
                )
                response = self._client.send(request, stream=stream)
            except httpx.TimeoutException as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self._backoff(attempt))
                    continue
                raise APIConnectionTimeoutError() from exc
            except httpx.HTTPError as exc:
                last_exc = exc
                if attempt < self.max_retries:
                    time.sleep(self._backoff(attempt))
                    continue
                raise APIConnectionError(f"Network error: {exc}", cause=exc) from exc

            if response.is_success:
                return response

            retryable = response.status_code in (408, 409, 429) or response.status_code >= 500
            if retryable and attempt < self.max_retries:
                retry_after = self._parse_retry_after(response.headers)
                response.close()
                time.sleep(retry_after if retry_after is not None else self._backoff(attempt))
                continue

            # Final failure — build a typed error.
            body_text = ""
            try:
                body_text = response.text
            except Exception:
                pass
            response.close()
            parsed: Any = body_text or None
            if body_text:
                try:
                    parsed = json.loads(body_text)
                except json.JSONDecodeError:
                    pass
            raise APIError.generate(
                response.status_code,
                parsed,
                response.reason_phrase,
                dict(response.headers),
            )

        # Should never reach here.
        raise APIConnectionError("Exhausted retries", cause=last_exc)

    @staticmethod
    def _backoff(attempt: int) -> float:
        base = min(0.5 * (2 ** attempt), 8.0)
        return base + random.uniform(0, base * 0.2)

    @staticmethod
    def _parse_retry_after(headers: Mapping[str, str]) -> Optional[float]:
        ra = headers.get("retry-after")
        if not ra:
            return None
        try:
            return min(float(ra), 30.0)
        except ValueError:
            try:
                when = parsedate_to_datetime(ra).timestamp()
                return max(0.0, when - time.time())
            except Exception:
                return None

    # -------- lifecycle --------

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def __enter__(self) -> "Wingman":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()
