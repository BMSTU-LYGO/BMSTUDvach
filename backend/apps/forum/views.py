from __future__ import annotations

from django.db.models import Prefetch
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.forum.models import Board, Post, Thread
from apps.forum.serializers import (
    BoardSerializer,
    PostCreateSerializer,
    PostSerializer,
    SearchResponseSerializer,
    ThreadCreateSerializer,
    ThreadDetailSerializer,
    ThreadListSerializer,
    annotate_op_preview,
    annotate_reply_counts,
    annotate_thread_counts,
)


class BoardListView(generics.ListAPIView):
    """List active boards."""

    serializer_class = BoardSerializer
    pagination_class = None

    def get_queryset(self):
        return annotate_thread_counts(Board.objects.filter(is_active=True))


class BoardDetailView(generics.RetrieveAPIView):
    """Retrieve a single board by slug."""

    serializer_class = BoardSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return Board.objects.filter(is_active=True)


class BoardThreadListCreateView(generics.ListCreateAPIView):
    """List threads for a board, or create a new thread with its OP.

    The listing order is selectable with the ``order`` query parameter:
    ``bump`` (activity, default), ``replies`` (reply count) or ``newest``
    (creation date). Anything else falls back to ``bump``; pinned threads
    always lead the page.
    """

    ORDERINGS = {
        "bump": ("-is_pinned", "-bumped_at"),
        "replies": ("-is_pinned", "-reply_count", "-bumped_at"),
        "newest": ("-is_pinned", "-created_at"),
    }

    def _get_board(self) -> Board:
        if not hasattr(self, "_board"):
            try:
                self._board = Board.objects.get(
                    slug=self.kwargs["slug"], is_active=True
                )
            except Board.DoesNotExist as exc:
                raise Http404("Board not found.") from exc
        return self._board

    def get_queryset(self):
        order = self.request.query_params.get("order", "bump")
        ordering = self.ORDERINGS.get(order, self.ORDERINGS["bump"])
        queryset = annotate_reply_counts(
            Thread.objects.for_listing().filter(board=self._get_board())
        )
        return annotate_op_preview(queryset.order_by(*ordering))

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ThreadCreateSerializer
        return ThreadListSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["board"] = self._get_board()
        return context

    def get_throttles(self):
        if self.request.method == "POST":
            self.throttle_scope = "thread_create"
        return super().get_throttles()

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        thread = serializer.save()
        output = ThreadDetailSerializer(thread, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)


@extend_schema(responses=SearchResponseSerializer)
class SearchView(APIView):
    """Signal scan: search thread titles and post bodies across the network.

    The frontend SCAN lens (Cmd/Ctrl+K) consumes this. Case-insensitive
    substring matching is honest about what it is — Postgres FTS is a
    later concern.
    """

    permission_classes = [permissions.AllowAny]

    LIMIT = 8

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        threads: list = []
        posts: list = []
        if query:
            threads = list(
                annotate_op_preview(
                    annotate_reply_counts(
                        Thread.objects.for_listing()
                        .filter(board__is_active=True, title__icontains=query)
                        .order_by("-is_pinned", "-bumped_at")
                    )
                )[: self.LIMIT]
            )
            posts = list(
                Post.objects.visible()
                .select_related("thread")
                .filter(thread__board__is_active=True, body__icontains=query)
                .order_by("-created_at")[: self.LIMIT]
            )
        return Response(
            {
                "query": query,
                "threads": ThreadListSerializer(threads, many=True).data,
                "posts": [
                    {
                        "id": post.id,
                        "thread": post.thread_id,
                        "thread_title": post.thread.title,
                        "is_op": post.is_op,
                        "snippet": _snippet(post.body, query, 140),
                    }
                    for post in posts
                ],
            }
        )


def _snippet(body: str, query: str, radius: int) -> str:
    index = body.lower().find(query.lower())
    if index < 0:
        return body[: radius * 2]
    start = max(0, index - radius)
    end = min(len(body), index + len(query) + radius)
    prefix = "…" if start > 0 else ""
    suffix = "…" if end < len(body) else ""
    return f"{prefix}{body[start:end].replace(chr(10), ' ')}{suffix}"


class RecentThreadListView(generics.ListAPIView):
    """Recent threads across all active boards (home feed)."""

    serializer_class = ThreadListSerializer
    pagination_class = None

    def get_queryset(self):
        try:
            limit = min(max(int(self.request.query_params.get("limit", 8)), 1), 20)
        except ValueError:
            limit = 8
        return annotate_op_preview(
            annotate_reply_counts(
                Thread.objects.for_listing()
                .filter(board__is_active=True)
                .order_by("-is_pinned", "-bumped_at")
            )
        )[:limit]


class ThreadDetailView(generics.RetrieveAPIView):
    """Retrieve a thread with its visible posts."""

    serializer_class = ThreadDetailSerializer

    def get_queryset(self):
        visible_posts = Post.objects.visible().prefetch_related("attachments")
        return annotate_reply_counts(
            Thread.objects.for_listing()
            .prefetch_related(Prefetch("posts", queryset=visible_posts))
            .order_by("-is_pinned", "-bumped_at")
        )


class PostCreateView(generics.CreateAPIView):
    """Create a reply inside a thread."""

    serializer_class = PostCreateSerializer
    throttle_scope = "post_create"

    def _get_thread(self) -> Thread:
        try:
            return Thread.objects.visible().get(pk=self.kwargs["pk"])
        except Thread.DoesNotExist as exc:
            raise Http404("Thread not found.") from exc

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["thread"] = self._get_thread()
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.save()
        output = PostSerializer(post, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)


class PostDetailView(generics.RetrieveAPIView):
    """Retrieve a single visible post."""

    serializer_class = PostSerializer
    queryset = Post.objects.visible().prefetch_related("attachments")
