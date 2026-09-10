from __future__ import annotations

from django.db.models import Prefetch
from django.http import Http404
from rest_framework import generics, status
from rest_framework.response import Response

from apps.forum.models import Board, Post, Thread
from apps.forum.serializers import (
    BoardSerializer,
    PostCreateSerializer,
    PostSerializer,
    ThreadCreateSerializer,
    ThreadDetailSerializer,
    ThreadListSerializer,
    annotate_reply_counts,
)


class BoardListView(generics.ListAPIView):
    """List active boards."""

    serializer_class = BoardSerializer
    pagination_class = None

    def get_queryset(self):
        return Board.objects.filter(is_active=True)


class BoardDetailView(generics.RetrieveAPIView):
    """Retrieve a single board by slug."""

    serializer_class = BoardSerializer
    lookup_field = "slug"

    def get_queryset(self):
        return Board.objects.filter(is_active=True)


class BoardThreadListCreateView(generics.ListCreateAPIView):
    """List threads for a board, or create a new thread with its OP."""

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
        return annotate_reply_counts(
            Thread.objects.for_listing()
            .filter(board=self._get_board())
            .order_by("-is_pinned", "-bumped_at")
        )

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
