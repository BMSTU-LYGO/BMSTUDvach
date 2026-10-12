from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from apps.common.serializers import HealthSerializer


@extend_schema(responses=HealthSerializer)
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request: Request) -> Response:
    """Unauthenticated liveness probe used by Docker/CI/smoke tests."""
    return Response({"status": "ok"})
