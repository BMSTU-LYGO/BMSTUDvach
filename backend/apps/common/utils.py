from __future__ import annotations

import hashlib
from typing import Any

from django.conf import settings


def get_client_ip(request: Any) -> str:
    """Best-effort client IP extraction behind proxies."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""


def client_fingerprint(request: Any) -> str:
    """Return a non-reversible fingerprint of the client for moderation.

    Raw IP addresses are never stored; only a salted hash is persisted.
    """
    ip = get_client_ip(request)
    user_agent = request.META.get("HTTP_USER_AGENT", "")
    raw = f"{ip}|{user_agent}|{settings.SECRET_KEY}".encode()
    return hashlib.sha256(raw).hexdigest()
