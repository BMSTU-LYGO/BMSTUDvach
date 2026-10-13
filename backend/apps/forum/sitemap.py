"""Sitemap and robots.txt for the public forum.

SPA routes (``/threads/<id>/``, ``/boards/<slug>/``) have no Django URL
patterns to reverse, so locations are built by hand.
"""

from django.contrib.sitemaps import Sitemap
from django.http import HttpResponse

from apps.forum.models import Board, Thread


class ThreadSitemap(Sitemap):
    """Public threads of active boards (SPA route)."""

    changefreq = "hourly"
    priority = 0.6
    limit = 50000

    def items(self):
        return Thread.objects.filter(is_hidden=False, board__is_active=True)

    def location(self, obj):
        return f"/threads/{obj.pk}/"

    def lastmod(self, obj):
        return obj.updated_at


class BoardSitemap(Sitemap):
    """Active boards (SPA route)."""

    changefreq = "daily"
    priority = 0.8

    def items(self):
        return Board.objects.filter(is_active=True)

    def location(self, obj):
        return f"/boards/{obj.slug}/"


def robots_txt(request):
    lines = [
        "User-agent: *",
        "Disallow: /api/",
        "Disallow: /admin/",
        "Allow: /",
        f"Sitemap: {request.build_absolute_uri('/sitemap.xml')}",
    ]
    return HttpResponse("\n".join(lines) + "\n", content_type="text/plain")
