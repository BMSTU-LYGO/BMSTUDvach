from __future__ import annotations

import re
from dataclasses import dataclass, field

# ``board:<slug>`` and ``title:<слово>`` — the classic search-engine
# operators the SCAN lens understands. ``\b`` keeps ``subtitle:`` from being
# read as an operator; ``\S*`` (not ``\S+``) also swallows a bare ``title:``
# so the leftover colon never leaks into the text search.
OPERATOR_PATTERN = re.compile(r"\b(?P<operator>board|title):(?P<value>\S*)")

# Punctuation typed right after an operator value («title:диффуры, …»).
# Trailing separators belong to the sentence, not to the slug or the word.
TRAILING_PUNCTUATION = ",;:.!?)]}\"'»…"


@dataclass(frozen=True)
class ParsedSearchQuery:
    """A scan query split into plain words, title words and a board scope.

    ``terms`` are the plain words left after the operators are removed;
    ``title_terms`` are the ``title:`` values (OR'ed); ``board_slug`` is the
    last ``board:`` value, or ``None`` when the query names no board.
    """

    terms: list[str] = field(default_factory=list)
    title_terms: list[str] = field(default_factory=list)
    board_slug: str | None = None

    @property
    def title_only(self) -> bool:
        """True when the query restricts the scan to thread titles only."""
        return bool(self.title_terms)

    @property
    def has_criteria(self) -> bool:
        """True when the query still carries something to match."""
        return bool(self.terms or self.title_terms)


def parse_search_query(raw: str) -> ParsedSearchQuery:
    """Parse a raw scan query into operators and plain words.

    Grammar (composable, order does not matter):

    * ``board:<slug>`` — narrow the scan to one board; the last one wins;
    * ``title:<слово>`` — match thread titles only, several are OR'ed;
    * everything else stays a plain word, matched against titles and bodies.

    Operators are recognised case-sensitively and in front of a word
    boundary, so ``subtitle:`` or ``Board:`` stay plain words. An operator
    with an empty or punctuation-only value is dropped silently.
    """
    board_slugs: list[str] = []
    title_terms: list[str] = []

    def consume(match: re.Match[str]) -> str:
        value = match.group("value").rstrip(TRAILING_PUNCTUATION)
        if value:
            if match.group("operator") == "board":
                board_slugs.append(value)
            else:
                title_terms.append(value)
        # The operator token itself is never searched for; a space keeps the
        # remaining words apart.
        return " "

    residue = OPERATOR_PATTERN.sub(consume, raw or "")
    return ParsedSearchQuery(
        terms=residue.split(),
        title_terms=title_terms,
        board_slug=board_slugs[-1] if board_slugs else None,
    )
