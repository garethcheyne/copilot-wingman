"""Wingman SDK error hierarchy. Mirrors the Node SDK."""

from __future__ import annotations

from typing import Any, Mapping, Optional, Union


class WingmanError(Exception):
    """Base class for all errors raised by the Wingman SDK."""


class APIError(WingmanError):
    """An HTTP error response from the Wingman API."""

    status: Optional[int]
    headers: Optional[Mapping[str, str]]
    body: Union[Mapping[str, Any], str, None]
    request_id: Optional[str]

    def __init__(
        self,
        status: Optional[int],
        body: Union[Mapping[str, Any], str, None],
        message: Optional[str],
        headers: Optional[Mapping[str, str]],
    ) -> None:
        self.status = status
        self.body = body
        self.headers = headers
        self.request_id = None
        if headers:
            self.request_id = headers.get("x-request-id") or headers.get("request-id")
        super().__init__(self._build_message(status, body, message))

    @staticmethod
    def _build_message(
        status: Optional[int],
        body: Union[Mapping[str, Any], str, None],
        message: Optional[str],
    ) -> str:
        body_msg: Optional[str] = None
        if isinstance(body, str):
            body_msg = body or None
        elif isinstance(body, Mapping):
            err = body.get("error")
            if isinstance(err, str):
                body_msg = err
            elif isinstance(err, Mapping):
                m = err.get("message")
                if isinstance(m, str):
                    body_msg = m
            if not body_msg:
                m2 = body.get("message")
                if isinstance(m2, str):
                    body_msg = m2
        final_msg = body_msg or message or "API request failed"
        return f"{status} {final_msg}" if status else final_msg

    @classmethod
    def generate(
        cls,
        status: Optional[int],
        body: Union[Mapping[str, Any], str, None],
        message: Optional[str],
        headers: Optional[Mapping[str, str]],
    ) -> "APIError":
        if status is None:
            return APIConnectionError(message or "Connection failed")
        mapping = {
            400: BadRequestError,
            401: AuthenticationError,
            403: PermissionDeniedError,
            404: NotFoundError,
            409: ConflictError,
            422: UnprocessableEntityError,
            429: RateLimitError,
        }
        if status in mapping:
            return mapping[status](status, body, message, headers)
        if 500 <= status < 600:
            return InternalServerError(status, body, message, headers)
        return APIError(status, body, message, headers)


class APIConnectionError(APIError):
    def __init__(self, message: str = "Connection error", cause: Optional[BaseException] = None) -> None:
        super().__init__(None, None, message, None)
        self.__cause__ = cause


class APIConnectionTimeoutError(APIConnectionError):
    def __init__(self, message: str = "Request timed out") -> None:
        super().__init__(message)


class APIUserAbortError(APIConnectionError):
    def __init__(self, message: str = "Request was aborted") -> None:
        super().__init__(message)


class BadRequestError(APIError):
    pass


class AuthenticationError(APIError):
    pass


class PermissionDeniedError(APIError):
    pass


class NotFoundError(APIError):
    pass


class ConflictError(APIError):
    pass


class UnprocessableEntityError(APIError):
    pass


class RateLimitError(APIError):
    pass


class InternalServerError(APIError):
    pass
