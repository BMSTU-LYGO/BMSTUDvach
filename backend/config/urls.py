"""Root URL configuration."""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.sitemaps.views import sitemap
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.common.views import health
from apps.forum.feeds import BoardThreadsFeed, LatestThreadsFeed, ThreadPostsFeed
from apps.forum.sitemap import BoardSitemap, ThreadSitemap, robots_txt

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/health/", health, name="health"),
    path("api/v1/", include("apps.forum.urls")),
    path("api/v1/", include("apps.moderation.urls")),
    path("api/v1/", include("apps.platinum.urls")),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="swagger-ui"),
    ),
    path(
        "sitemap.xml",
        sitemap,
        {"sitemaps": {"threads": ThreadSitemap, "boards": BoardSitemap}},
        name="django.contrib.sitemaps.views.sitemap",
    ),
    path(
        "sitemap-<str:section>.xml",
        sitemap,
        {"sitemaps": {"threads": ThreadSitemap, "boards": BoardSitemap}},
        name="django.contrib.sitemaps.views.section",
    ),
    path("robots.txt", robots_txt, name="robots_txt"),
    path("feed/recent.xml", LatestThreadsFeed(), name="feed_recent"),
    path(
        "feed/board/<slug:slug>.xml",
        BoardThreadsFeed(),
        name="feed_board",
    ),
    path("feed/thread/<int:pk>.xml", ThreadPostsFeed(), name="feed_thread"),
]

# Development only — production must serve media from a real web server.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
