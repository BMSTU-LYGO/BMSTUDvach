from django.urls import path

from apps.moderation import views

urlpatterns = [
    path(
        "posts/<int:pk>/reports/",
        views.ReportCreateView.as_view(),
        name="post-reports",
    ),
]
