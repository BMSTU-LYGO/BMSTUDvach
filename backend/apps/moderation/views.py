from __future__ import annotations

from django.http import Http404
from rest_framework import generics, status
from rest_framework.response import Response

from apps.forum.models import Post
from apps.moderation.serializers import ReportCreateSerializer


class ReportCreateView(generics.CreateAPIView):
    """Submit a report for a post."""

    serializer_class = ReportCreateSerializer
    throttle_scope = "report_create"

    def _get_post(self) -> Post:
        try:
            return Post.objects.visible().get(pk=self.kwargs["pk"])
        except Post.DoesNotExist as exc:
            raise Http404("Post not found.") from exc

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["post"] = self._get_post()
        return context

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        return Response(
            {"detail": "Report accepted.", "id": report.id},
            status=status.HTTP_201_CREATED,
        )
