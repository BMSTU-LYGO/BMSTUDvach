"""Test settings.

By default tests run on an in-memory SQLite database so they are fast and
need no external services. Set ``TEST_USE_SQLITE=false`` (and provide the
POSTGRES_* variables) to run the suite against PostgreSQL, as Docker/CI do.
"""

from .base import *  # noqa: F401,F403
from .base import DATABASES, env_bool

if env_bool("TEST_USE_SQLITE", True):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": ":memory:",
        }
    }

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
ALLOWED_HOSTS = ["*"]
