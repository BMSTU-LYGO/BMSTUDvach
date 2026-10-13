from __future__ import annotations

from django.contrib.auth import authenticate, login
from django.http import Http404
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.forum.models import Post, Thread
from apps.moderation.models import ModerationLog, Report
from apps.moderation.serializers import (
    ModerationLogSerializer,
    ModerationPostSerializer,
    ReportCreateSerializer,
    ReportResolveSerializer,
    StaffLoginSerializer,
    StaffSessionSerializer,
    ThreadStateSerializer,
)


class StaffOnly(permissions.BasePermission):
    """Moderation tools are for authenticated staff only."""

    def has_permission(self, request, view) -> bool:
        return bool(
            request.user and request.user.is_authenticated and request.user.is_staff
        )


def _log_action(
    request, action: str, target_type: str, target_id: int, note: str = ""
) -> None:
    """Write an audit row for a staff action.

    Always called *after* the mutation it describes: the action is already
    committed, so a log write failing must not turn it into an error.
    """
    ModerationLog.objects.create(
        actor=request.user.get_username(),
        action=action,
        target_type=target_type,
        target_id=target_id,
        note=note[:255],
    )


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


@extend_schema(
    request=StaffLoginSerializer,
    responses={200: StaffSessionSerializer, 403: None},
)
class StaffLoginView(APIView):
    """Session login for the moderation console (staff only)."""

    permission_classes = [permissions.AllowAny]

    # the console needs the csrftoken cookie to make staff calls
    @method_decorator(ensure_csrf_cookie)
    def post(self, request):
        username = (request.data or {}).get("username", "")
        password = (request.data or {}).get("password", "")
        user = authenticate(request, username=username, password=password)
        if user is None or not user.is_staff:
            return Response(
                {"detail": "Неверные учётные данные или нет доступа."},
                status=status.HTTP_403_FORBIDDEN,
            )
        login(request, user)
        return Response({"username": user.get_username(), "is_staff": True})


@extend_schema(responses={200: StaffSessionSerializer})
class StaffMeView(APIView):
    """Who is the current session (drives the console UI)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        if request.user and request.user.is_authenticated and request.user.is_staff:
            return Response(
                {"is_staff": True, "username": request.user.get_username()},
            )
        return Response({"is_staff": False})


class ReportQueueView(generics.ListAPIView):
    """Open reports, newest first, with enough post context to act."""

    permission_classes = [StaffOnly]
    pagination_class = None
    serializer_class = ModerationPostSerializer

    def get_queryset(self):
        status_filter = self.request.query_params.get("status", Report.Status.NEW)
        return (
            Report.objects.filter(status=status_filter)
            .select_related("post", "post__thread")
            .order_by("-created_at")[:50]
        )

    def list(self, request, *args, **kwargs):
        reports = self.get_queryset()
        data = [
            {
                "id": report.id,
                "reason": report.reason,
                "comment": report.comment,
                "status": report.status,
                "created_at": report.created_at,
                "post": {
                    "id": report.post_id,
                    "thread": report.post.thread_id,
                    "thread_title": report.post.thread.title,
                    "is_hidden": report.post.is_hidden,
                    "body": report.post.body[:200],
                },
            }
            for report in reports
        ]
        return Response({"reports": data})


class ModerationLogListView(APIView):
    """Last 100 staff actions, newest first — the console audit panel."""

    permission_classes = [StaffOnly]

    @extend_schema(responses={200: ModerationLogSerializer})
    def get(self, request):
        entries = ModerationLog.objects.all()[:100]
        data = [
            {
                "id": entry.id,
                "actor": entry.actor,
                "action": entry.action,
                "target_type": entry.target_type,
                "target_id": entry.target_id,
                "note": entry.note,
                "created_at": entry.created_at,
            }
            for entry in entries
        ]
        return Response({"actions": data})


@extend_schema(
    request=ReportResolveSerializer,
    responses={200: ReportResolveSerializer, 400: None},
)
class ReportResolveView(APIView):
    """Dismiss a report, or action it (hides the reported post)."""

    permission_classes = [StaffOnly]

    def post(self, request, pk):
        try:
            report = Report.objects.get(pk=pk)
        except Report.DoesNotExist as exc:
            raise Http404("Report not found.") from exc

        serializer = ReportResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action = serializer.validated_data["action"]

        if action == "action":
            report.post.is_hidden = True
            report.post.save(update_fields=["is_hidden", "updated_at"])
            report.status = Report.Status.ACTIONED
            log_action = ModerationLog.Action.REPORT_ACTION
            log_note = f"скрыт пост #{report.post_id}"
        else:
            report.status = Report.Status.DISMISSED
            log_action = ModerationLog.Action.REPORT_DISMISS
            log_note = ""
        report.save(update_fields=["status", "updated_at"])
        _log_action(request, log_action, "report", report.id, log_note)
        return Response({"id": report.id, "status": report.status})


class PostModerationView(APIView):
    """Hide/restore a post from the console."""

    permission_classes = [StaffOnly]

    @extend_schema(request=None, responses=ModerationPostSerializer)
    def post(self, request, pk, action):
        try:
            post = Post.objects.get(pk=pk)
        except Post.DoesNotExist as exc:
            raise Http404("Post not found.") from exc

        actions = {
            "hide": ModerationLog.Action.HIDE_POST,
            "show": ModerationLog.Action.SHOW_POST,
        }
        if action not in actions:
            return Response(
                {"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST
            )
        post.is_hidden = action == "hide"
        post.save(update_fields=["is_hidden", "updated_at"])
        _log_action(request, actions[action], "post", post.id)
        return Response({"id": post.id, "is_hidden": post.is_hidden})


class ThreadModerationView(APIView):
    """Hide/restore, lock/unlock or pin/unpin a thread from the console."""

    permission_classes = [StaffOnly]

    @extend_schema(request=None, responses=ThreadStateSerializer)
    def post(self, request, pk, action):
        try:
            thread = Thread.objects.get(pk=pk)
        except Thread.DoesNotExist as exc:
            raise Http404("Thread not found.") from exc

        actions = {
            # action: (flag field, new value, log action)
            "hide": ("is_hidden", True, ModerationLog.Action.HIDE_THREAD),
            "show": ("is_hidden", False, ModerationLog.Action.SHOW_THREAD),
            "lock": ("is_locked", True, ModerationLog.Action.LOCK_THREAD),
            "unlock": ("is_locked", False, ModerationLog.Action.UNLOCK_THREAD),
            "pin": ("is_pinned", True, ModerationLog.Action.PIN_THREAD),
            "unpin": ("is_pinned", False, ModerationLog.Action.UNPIN_THREAD),
        }
        if action not in actions:
            return Response(
                {"detail": "Unknown action."}, status=status.HTTP_400_BAD_REQUEST
            )
        field, value, log_action = actions[action]
        Thread.objects.filter(pk=pk).update(**{field: value})
        thread.refresh_from_db()
        _log_action(request, log_action, "thread", thread.id)
        return Response(
            {
                "id": thread.id,
                "is_hidden": thread.is_hidden,
                "is_locked": thread.is_locked,
                "is_pinned": thread.is_pinned,
            }
        )
