"""Wingman SDK — official Python client for the Wingman chat proxy."""

from .version import __version__
from .client import Wingman
from .errors import (
    WingmanError,
    APIError,
    APIConnectionError,
    APIConnectionTimeoutError,
    APIUserAbortError,
    BadRequestError,
    AuthenticationError,
    PermissionDeniedError,
    NotFoundError,
    ConflictError,
    UnprocessableEntityError,
    RateLimitError,
    InternalServerError,
)
from .resources.chat import ChatResponse, ChatStreamChunk
from .resources.models import ModelInfo
from .resources.health import HealthResponse

__all__ = [
    "__version__",
    "Wingman",
    "WingmanError",
    "APIError",
    "APIConnectionError",
    "APIConnectionTimeoutError",
    "APIUserAbortError",
    "BadRequestError",
    "AuthenticationError",
    "PermissionDeniedError",
    "NotFoundError",
    "ConflictError",
    "UnprocessableEntityError",
    "RateLimitError",
    "InternalServerError",
    "ChatResponse",
    "ChatStreamChunk",
    "ModelInfo",
    "HealthResponse",
]
