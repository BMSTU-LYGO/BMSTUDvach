from __future__ import annotations

import re

from django.db.models import QuerySet
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.forum.models import Post

TRIPCODE_MAX = 16
MENTION_LIMIT = 30
# Conscious compromise: only the newest N «>>»-bearing posts are parsed in
# Python. See PostMentionsView for why that is enough for a home beacon.
SCAN_WINDOW = 1000
SNIPPET_RADIUS = 70

_REPLY_LINK = re.compile(r">>(\d+)")


class MentionSerializer(serializers.Serializer):
    """One visible reply that links to a post of the queried tripcode."""

    post = serializers.IntegerField()
    thread = serializers.IntegerField()
    thread_title = serializers.CharField()
    body = serializers.CharField()
    created_at = serializers.DateTimeField()
    snippet = serializers.CharField()


class MentionsSerializer(serializers.Serializer):
    """Replies to the posts of a tripcode, passed as ``?trip=!xxxxxxxx``."""

    tripcode = serializers.CharField()
    count = serializers.IntegerField()
    mentions = MentionSerializer(many=True)


@extend_schema(responses=MentionsSerializer)
class PostMentionsView(APIView):
    """Answers to my posts, found by tripcode alone.

    The forum has no accounts, so the only honest "mine" signal a post
    carries is its tripcode — the one-way fingerprint of «Имя#секрет».
    This view answers one question: which visible replies link ``>>N`` to
    a visible post that carries that same tripcode.

    Only visible content in active boards is considered, and messages
    written with the same tripcode are excluded — a tripcode is not a
    person, but nobody wants their own posts listed as answers to them.

    The query is deliberately cheap: ``body__contains=">>"`` filters in
    SQL, and only the newest ``SCAN_WINDOW`` candidates are parsed with a
    regex. That is a conscious compromise — an answer to a very old post
    that has fallen outside the newest 1000 replies will not be found.
    A home-page beacon needs "recent answers", not an archive scan.
    """

    permission_classes = [permissions.AllowAny]

    LIMIT = MENTION_LIMIT

    def get(self, request):
        trip = _normalize_tripcode(request.query_params.get("trip"))
        if not trip:
            return Response(
                {
                    "detail": (
                        "Укажите трипкод: GET /api/v1/posts/mentions/?trip=!xxxxxxxx"
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        mentions = self._mentions(trip)
        return Response({"tripcode": trip, "count": len(mentions), "mentions": mentions})

    def _mentions(self, trip: str) -> list[dict]:
        visible = _visible_posts()
        mine = set(visible.filter(tripcode=trip).values_list("id", flat=True))
        if not mine:
            return []
        candidates = (
            visible.filter(body__contains=">>")
            .exclude(tripcode=trip)
            .select_related("thread")
            .order_by("-created_at", "-id")[:SCAN_WINDOW]
        )
        found = [_row(post, mine) for post in candidates if _first_link(post.body, mine)]
        return found[: self.LIMIT]


def _visible_posts() -> QuerySet[Post]:
    """Visible posts in visible threads of active boards."""
    return Post.objects.filter(
        thread__board__is_active=True, thread__is_hidden=False, is_hidden=False
    )


def _normalize_tripcode(raw: str | None) -> str:
    """Drop control characters, trim, cap at TRIPCODE_MAX."""
    cleaned = "".join(ch for ch in (raw or "") if ch >= " ")
    return cleaned.strip()[:TRIPCODE_MAX]


def _first_link(body: str, targets: set[int]) -> re.Match[str] | None:
    """First ``>>N`` in the body whose target belongs to ``targets``."""
    for match in _REPLY_LINK.finditer(body):
        if int(match.group(1)) in targets:
            return match
    return None


def _snippet(body: str, link: re.Match[str]) -> str:
    """Body fragment around a reply link, cropped with «…» (as in search)."""
    start = max(0, link.start() - SNIPPET_RADIUS)
    end = min(len(body), link.end() + SNIPPET_RADIUS)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(body) else ""
    return f"{prefix}{body[start:end].replace(chr(10), ' ')}{suffix}"


def _row(post: Post, mine: set[int]) -> dict:
    link = _first_link(post.body, mine)
    return {
        "post": post.id,
        "thread": post.thread_id,
        "thread_title": post.thread.title,
        "body": post.body,
        "created_at": post.created_at.isoformat(),
        "snippet": _snippet(post.body, link) if link else "",
    }
