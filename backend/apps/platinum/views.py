from __future__ import annotations

from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.platinum.context import load_context
from apps.platinum.generators import get_generator
from apps.platinum.models import PlatinumStory
from apps.platinum.serializers import (
    PlatinumGenerateSerializer,
    PlatinumStorySerializer,
)


class PlatinumStoryListView(generics.ListAPIView):
    """List published platinum stories."""

    serializer_class = PlatinumStorySerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        return PlatinumStory.objects.filter(status=PlatinumStory.Status.PUBLISHED)


class PlatinumStoryDetailView(generics.RetrieveAPIView):
    """Retrieve a published platinum story."""

    serializer_class = PlatinumStorySerializer
    permission_classes = [permissions.AllowAny]
    queryset = PlatinumStory.objects.filter(status=PlatinumStory.Status.PUBLISHED)


class PlatinumGenerateView(APIView):
    """Dev-only endpoint: generate a platinum story using the configured generator.

    Requires staff authentication to prevent abuse.
    """

    permission_classes = [permissions.IsAdminUser]
    throttle_scope = "platinum_generate"

    def post(self, request):
        serializer = PlatinumGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        generator = get_generator(settings.PLATINUM_GENERATOR_PROVIDER)
        context = load_context()

        result = generator.generate(
            source_title=serializer.validated_data["title"],
            source_body=serializer.validated_data["body"],
            context=context,
        )

        story = PlatinumStory.objects.create(
            title=result.title,
            body=result.body,
            source_type="generated",
            status=PlatinumStory.Status.GENERATED,
            generation_metadata=result.metadata,
        )

        output = PlatinumStorySerializer(story)
        return Response(output.data, status=status.HTTP_201_CREATED)
