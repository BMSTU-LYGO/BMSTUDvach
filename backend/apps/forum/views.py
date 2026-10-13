from __future__ import annotations

from django.db.models import Prefetch, Q
from django.http import Http404
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.forum.models import Board, Post, Thread
from apps.forum.search_query import ParsedSearchQuery, parse_search_query
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

    The query itself composes classic search-engine operators (see
    :func:`apps.forum.search_query.parse_search_query`):

    * plain words — thread titles and post bodies, as before;
    * ``title:<слово>`` — thread titles only; post bodies are skipped
      entirely, so ``posts`` comes back empty. Repeated ``title:``
      operators are OR'ed, and they AND with the plain words;
    * ``board:<slug>`` — narrow both result lists to one board, same as the
      ``board`` query parameter. The operator wins when the two disagree.

    An unknown board slug is not an error: the scan just stays quiet and
    returns empty lists, same as a query without hits. The response shape
    never depends on the operators — ``query`` echoes the string as typed.
    """

    permission_classes = [permissions.AllowAny]

    LIMIT = 8

    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        board = (request.query_params.get("board") or "").strip()
        parsed = parse_search_query(query)
        if parsed.board_slug:
            board = parsed.board_slug
        threads: list = []
        posts: list = []
        if query and parsed.has_criteria:
            needles = " ".join(parsed.terms)
            threads = list(
                annotate_op_preview(
                    annotate_reply_counts(
                        Thread.objects.for_listing()
                        .filter(_thread_scope(parsed, needles, board))
                        .order_by("-is_pinned", "-bumped_at")
                    )
                )[: self.LIMIT]
            )
            if not parsed.title_only:
                posts = list(
                    Post.objects.visible()
                    .select_related("thread")
                    .filter(_post_scope(needles, board))
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
                        "snippet": _snippet(post.body, needles, 140),
                    }
                    for post in posts
                ],
            }
        )


def _thread_scope(parsed: ParsedSearchQuery, needles: str, board: str) -> Q:
    """Build the thread filter for a parsed scan query.

    ``title:`` words are OR'ed (any of them may match), the plain words
    stay a single substring match, and everything ANDs together.
    """
    scope = Q(board__is_active=True)
    if board:
        scope &= Q(board__slug=board)
    if parsed.title_terms:
        scope &= _any_of("title__icontains", parsed.title_terms)
    if needles:
        scope &= Q(title__icontains=needles)
    return scope


def _post_scope(needles: str, board: str) -> Q:
    """Build the post-body filter for a parsed scan query."""
    scope = Q(thread__board__is_active=True)
    if board:
        scope &= Q(thread__board__slug=board)
    if needles:
        scope &= Q(body__icontains=needles)
    return scope


def _any_of(lookup: str, values: list[str]) -> Q:
    """OR a set of ``icontains`` lookups: any single value may match."""
    scope = Q()
    for value in values:
        scope |= Q(**{lookup: value})
    return scope


def _snippet(body: str, query: str, radius: int) -> str:
    """Cut a window of ``body`` around the first occurrence of ``query``."""
    index = body.lower().find(query.lower()) if query else -1
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
