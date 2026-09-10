"""Platinum story generation architecture.

Provides an abstract ``PlatinumGenerator`` interface and a concrete
``FakePlatinumGenerator`` for development and testing.  A registry maps
provider names (from settings) to generator classes so that the concrete
LLM adapter can be swapped without touching domain logic.
"""

from __future__ import annotations

import abc
import dataclasses
from typing import Any


@dataclasses.dataclass(frozen=True, slots=True)
class GeneratedStory:
    """Value object returned by a generator."""

    title: str
    body: str
    metadata: dict[str, Any] = dataclasses.field(default_factory=dict)


class PlatinumGenerator(abc.ABC):
    """Interface that all LLM adapters must implement."""

    @abc.abstractmethod
    def generate(
        self, source_title: str, source_body: str, context: dict[str, Any]
    ) -> GeneratedStory: ...


class FakePlatinumGenerator(PlatinumGenerator):
    """Deterministic generator for local dev and tests."""

    def generate(
        self, source_title: str, source_body: str, context: dict[str, Any]
    ) -> GeneratedStory:
        title = f"[fake] {source_title}" if source_title else "[fake] Платина"
        body = (
            f"Это фейковая сгенерированная история для разработки.\n\n"
            f"Оригинальный заголовок: {source_title}\n"
            f"Факультет: {context.get('faculty', 'unknown')}"
        )
        return GeneratedStory(
            title=title,
            body=body,
            metadata={"provider": "fake", "source_title": source_title},
        )


_REGISTRY: dict[str, type[PlatinumGenerator]] = {
    "fake": FakePlatinumGenerator,
}


def get_generator(provider_name: str | None = None) -> PlatinumGenerator:
    """Return a generator instance for the given provider name.

    Falls back to ``FakePlatinumGenerator`` when the name is missing or unknown.
    """
    name = (provider_name or "fake").strip().lower()
    cls = _REGISTRY.get(name, FakePlatinumGenerator)
    return cls()


def register_generator(name: str, cls: type[PlatinumGenerator]) -> None:
    """Register a custom generator class (used by LLM adapters)."""
    _REGISTRY[name.strip().lower()] = cls
