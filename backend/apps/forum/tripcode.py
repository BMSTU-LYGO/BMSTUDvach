from __future__ import annotations

import base64
import hashlib

DISPLAY_NAME_MAX = 64
TRIPCODE_LENGTH = 8

_CONTROL_CODES = frozenset(
    [chr(code) for code in range(0x20)] + [chr(0x7F), chr(0x80), chr(0x9F)]
)


def display_name(raw: str) -> str:
    """Normalize the visible part of an imageboard name.

    Control characters are dropped (they only smuggle UI spoofing), the
    result is trimmed and capped at ``DISPLAY_NAME_MAX`` characters.
    """
    cleaned = "".join(ch for ch in (raw or "") if ch not in _CONTROL_CODES)
    return cleaned.strip()[:DISPLAY_NAME_MAX]


def split_name(raw: str) -> tuple[str, str]:
    """Split a raw ``Имя#секрет`` name into (display name, secret).

    The secret is trimmed; the display part keeps its shape. A name
    without ``#`` carries no secret at all.
    """
    head, _, secret = (raw or "").partition("#")
    return display_name(head), secret.strip()


def compute_tripcode(secret: str) -> str:
    """Deterministic ``!xxxxxxxx`` code derived from a secret.

    sha256 over the utf-8 bytes, base64 with a URL-safe-ish alphabet
    (+ → a, / → b), padding stripped, first 8 chars. The secret itself is
    never stored: only this one-way fingerprint travels with the post.
    An empty secret yields an empty string — anonymous stays anonymous.
    """
    secret = (secret or "").strip()
    if not secret:
        return ""
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    code = base64.b64encode(digest).decode("ascii")
    code = code.replace("+", "a").replace("/", "b").rstrip("=")
    return f"!{code[:TRIPCODE_LENGTH]}"
