"""Context loader for Platinum generation.

On a real deployment this would load BMSTU-specific context (faculties,
buildings, slang, etc.) from data files.  For now it returns a minimal
stub so the pipeline is exercisable without external data.
"""
from __future__ import annotations

from typing import Any


def load_context() -> dict[str, Any]:
    """Return the current BMSTU generation context."""
    return {
        "faculty": "ИУ",
        "building": "Корпус на Ленинском",
        "slang": [],
        "subjects": [],
    }
