from __future__ import annotations

from typing import Any

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """Normalize DRF errors into a stable ``{detail, errors}`` envelope."""
    response = exception_handler(exc, context)
    if response is None:
        # Unhandled server error: let Django render a generic response.
        return None

    data = response.data
    if response.status_code == status.HTTP_400_BAD_REQUEST:
        response.data = {"detail": "Validation error", "errors": data}
    elif isinstance(data, dict) and "detail" in data and len(data) == 1:
        # Permission/auth/not-found style responses already carry ``detail``.
        return response
    elif isinstance(data, (dict, list)):
        response.data = {"detail": "Request failed", "errors": data}

    return response
