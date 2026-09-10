from django.urls import path

from apps.platinum import views

urlpatterns = [
    path(
        "platinum/",
        views.PlatinumStoryListView.as_view(),
        name="platinum-list",
    ),
    path(
        "platinum/<int:pk>/",
        views.PlatinumStoryDetailView.as_view(),
        name="platinum-detail",
    ),
    path(
        "platinum/generate/",
        views.PlatinumGenerateView.as_view(),
        name="platinum-generate",
    ),
]
