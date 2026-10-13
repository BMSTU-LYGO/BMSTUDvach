from django.urls import path

from apps.moderation import views

urlpatterns = [
    path(
        "posts/<int:pk>/reports/",
        views.ReportCreateView.as_view(),
        name="post-reports",
    ),
    path(
        "announcements/",
        views.ActiveAnnouncementsView.as_view(),
        name="announcements-active",
    ),
    # --- staff console -----------------------------------------------------
    path("moderation/login/", views.StaffLoginView.as_view(), name="staff-login"),
    path("moderation/me/", views.StaffMeView.as_view(), name="staff-me"),
    path("moderation/reports/", views.ReportQueueView.as_view(), name="report-queue"),
    path(
        "moderation/log/",
        views.ModerationLogListView.as_view(),
        name="action-log",
    ),
    path(
        "moderation/announcements/",
        views.AnnouncementCreateView.as_view(),
        name="announcement-create",
    ),
    path(
        "moderation/announcements/<int:pk>/toggle/",
        views.AnnouncementToggleView.as_view(),
        name="announcement-toggle",
    ),
    path(
        "moderation/reports/<int:pk>/resolve/",
        views.ReportResolveView.as_view(),
        name="report-resolve",
    ),
    path(
        "moderation/posts/<int:pk>/<str:action>/",
        views.PostModerationView.as_view(),
        name="post-moderation",
    ),
    path(
        "moderation/threads/<int:pk>/<str:action>/",
        views.ThreadModerationView.as_view(),
        name="thread-moderation",
    ),
]
