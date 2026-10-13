from django.urls import path

from apps.forum import mentions as views_mentions
from apps.forum import telemetry as views_tel
from apps.forum import views

urlpatterns = [
    path("boards/", views.BoardListView.as_view(), name="board-list"),
    path(
        "boards/<slug:slug>/",
        views.BoardDetailView.as_view(),
        name="board-detail",
    ),
    path(
        "boards/<slug:slug>/threads/",
        views.BoardThreadListCreateView.as_view(),
        name="board-threads",
    ),
    path("search/", views.SearchView.as_view(), name="search"),
    path("telemetry/", views_tel.TelemetryView.as_view(), name="telemetry"),
    path(
        "threads/recent/",
        views.RecentThreadListView.as_view(),
        name="thread-recent",
    ),
    path(
        "threads/<int:pk>/",
        views.ThreadDetailView.as_view(),
        name="thread-detail",
    ),
    path(
        "threads/<int:pk>/posts/",
        views.PostCreateView.as_view(),
        name="thread-posts",
    ),
    path(
        "posts/mentions/",
        views_mentions.PostMentionsView.as_view(),
        name="post-mentions",
    ),
    path("posts/<int:pk>/", views.PostDetailView.as_view(), name="post-detail"),
]
