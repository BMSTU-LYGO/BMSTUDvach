"""Settings package. Defaults to local for developer convenience."""
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")
