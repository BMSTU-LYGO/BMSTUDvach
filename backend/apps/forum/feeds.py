"""RSS 2.0 feeds for the public forum.

Uses only ``django.contrib.syndication`` — one feed per scope: the whole
site, a single board and a single thread. Links are built by hand because
the SPA routes have no Django URL patterns to reverse (see ``sitemap.py``).
"""

from __future__ import annotations

from datetime import datetime

from django.contrib.syndication.views import Feed
from django.http import Http404
from django.utils.feedgenerator import Rss201rev2Feed

from apps.forum.models import Board, Post, Thread
from apps.forum.serializers import OP_SNIPPET_MAX, annotate_op_preview

FEED_ITEM_LIMIT = 30


def _snippet(body: str) -> str:
    """Trim a post body to the shared ``OP_SNIPPET_MAX`` length."""
    body = (body or "").strip()
    if len(body) <= OP_SNIPPET_MAX:
        return body
    return f"{body[:OP_SNIPPET_MAX].rstrip()}…"


class LatestThreadsFeed(Feed):
    """Last bumped threads across every active board."""

    feed_type = Rss201rev2Feed
    title = "BMSTUDvach — последние треды"
    description = "Последние треды активных разделов BMSTUDvach."

    def get_object(self, request, *args, **kwargs):
        """Store the request so dynamic attrs can build absolute URLs."""
        self.request = request
        return None

    def link(self) -> str:
        return self.request.build_absolute_uri("/")

    def items(self):
        queryset = (
            Thread.objects.visible()
            .filter(board__is_active=True)
            .select_related("board")
            .order_by("-bumped_at")
        )
        return annotate_op_preview(queryset)[:FEED_ITEM_LIMIT]

    def item_title(self, item: Thread) -> str:
        return item.title

    def item_description(self, item: Thread) -> str:
        return _snippet(getattr(item, "op_body", "") or "")

    def item_link(self, item: Thread) -> str:
        return self.request.build_absolute_uri(f"/threads/{item.pk}/")

    def item_pubdate(self, item: Thread) -> datetime:
        return item.bumped_at

    def item_guid(self, item: Thread) -> str:
        return f"bmstudvach:thread:{item.pk}"


class BoardThreadsFeed(Feed):
    """Threads of a single active board."""

    feed_type = Rss201rev2Feed

    def get_object(self, request, slug: str) -> Board:
        self.request = request
        try:
            return Board.objects.get(slug=slug, is_active=True)
        except Board.DoesNotExist as exc:
            raise Http404("Board not found") from exc

    def title(self, obj: Board) -> str:
        return f"BMSTUDvach — /{obj.slug}/ {obj.name}"

    def link(self, obj: Board) -> str:
        return self.request.build_absolute_uri(f"/boards/{obj.slug}/")

    def description(self, obj: Board) -> str:
        return obj.description or f"Треды раздела /{obj.slug}/."

    def items(self, obj: Board):
        queryset = (
            Thread.objects.visible()
            .filter(board=obj)
            .select_related("board")
            .order_by("-bumped_at")
        )
        return annotate_op_preview(queryset)[:FEED_ITEM_LIMIT]

    def item_title(self, item: Thread) -> str:
        return item.title

    def item_description(self, item: Thread) -> str:
        return _snippet(getattr(item, "op_body", "") or "")

    def item_link(self, item: Thread) -> str:
        return self.request.build_absolute_uri(f"/threads/{item.pk}/")

    def item_pubdate(self, item: Thread) -> datetime:
        return item.bumped_at

    def item_guid(self, item: Thread) -> str:
        return f"bmstudvach:thread:{item.pk}"


class ThreadPostsFeed(Feed):
    """Visible posts of a single visible thread, oldest first."""

    feed_type = Rss201rev2Feed

    def get_object(self, request, pk: int) -> Thread:
        self.request = request
        try:
            return Thread.objects.visible().select_related("board").get(pk=pk)
        except Thread.DoesNotExist as exc:
            raise Http404("Thread not found") from exc

    def title(self, obj: Thread) -> str:
        return f"BMSTUDvach — тред: {obj.title}"

    def link(self, obj: Thread) -> str:
        return self.request.build_absolute_uri(f"/threads/{obj.pk}/")

    def description(self, obj: Thread) -> str:
        return f"Посты треда «{obj.title}» на BMSTUDvach."

    def items(self, obj: Thread):
        return obj.posts.visible().select_related("thread").order_by("created_at")

    def item_title(self, item: Post) -> str:
        return f"тред: {item.thread.title}"

    def item_description(self, item: Post) -> str:
        return _snippet(item.body)

    def item_link(self, item: Post) -> str:
        return self.request.build_absolute_uri(f"/threads/{item.thread_id}/")

    def item_pubdate(self, item: Post) -> datetime:
        return item.created_at

    def item_guid(self, item: Post) -> str:
        return f"bmstudvach:post:{item.pk}"
