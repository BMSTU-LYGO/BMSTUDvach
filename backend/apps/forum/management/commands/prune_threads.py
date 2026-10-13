"""prune_threads — hide forum threads that stopped being active long ago.

A dead thread sinks to the bottom of the board on its own, but it still
occupies the listing and everyone's scroll. This command hides threads
whose last bump is older than ``--days`` days so a busy section stays
readable. Nothing is deleted: a moderator can restore any thread.

Safe by default: without ``--apply`` the command is a dry run that only
prints what it *would* hide. ``--dry-run`` is accepted as an explicit no-op
for operators who type it out of habit. With ``--apply`` the selection is
hidden by a single ``UPDATE`` query.

``updated_at`` is intentionally left untouched: mass-hiding is janitorial
bookkeeping, not new content, and stamping it as an update would make the
archive lie about recent activity (the «last activity» signal of a hidden
thread stays exactly when the thread really stopped being alive).

Idempotent: hidden threads are excluded from the selection, so a second
run finds nothing and reports ``nothing to prune``. Pinned threads are
never touched; locked ones are fair game — a lock ends the discussion,
it does not keep it alive.
"""

from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.forum.models import Board, Thread


def _positive_int(flag: str, value: object) -> int:
    """Parse an option that must be a strictly positive integer."""

    try:
        number = int(value)
    except (TypeError, ValueError):
        raise CommandError(f"{flag}: expected an integer, got {value!r}") from None
    if number < 1:
        raise CommandError(f"{flag}: expected a positive integer, got {number}")
    return number


class Command(BaseCommand):
    help = (
        "Скрыть треды без активности дольше N дней "
        "(по умолчанию dry-run: печатает, что скрыл бы)."
    )

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--days",
            default=90,
            metavar="N",
            help="Сколько дней молчания считается смертью треда (по умолчанию 90).",
        )
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Действительно скрыть найденные треды. Без флага — только dry-run.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Явный dry-run (это и так режим по умолчанию).",
        )
        parser.add_argument(
            "--board",
            default=None,
            metavar="SLUG",
            help="Ограничить очистку одним разделом, например 'b'.",
        )
        parser.add_argument(
            "--limit",
            default=200,
            metavar="N",
            help="Максимум тредов за запуск (по умолчанию 200).",
        )

    def handle(self, *args, **options):
        days = _positive_int("--days", options["days"])
        limit = _positive_int("--limit", options["limit"])
        board_slug: str | None = options["board"]
        apply_changes: bool = options["apply"]
        if apply_changes and options["dry_run"]:
            raise CommandError("--apply and --dry-run are mutually exclusive")

        if (
            board_slug
            and not Board.objects.filter(slug=board_slug, is_active=True).exists()
        ):
            self.stdout.write(f"board /{board_slug}/ not found or inactive")

        cutoff = timezone.now() - timedelta(days=days)
        threads = Thread.objects.filter(
            is_hidden=False,
            is_pinned=False,
            bumped_at__lt=cutoff,
            board__is_active=True,
        )
        if board_slug:
            threads = threads.filter(board__slug=board_slug)
        threads = list(threads.select_related("board").order_by("bumped_at")[:limit])

        if not threads:
            self.stdout.write("nothing to prune")
            return

        prefix = "hide" if apply_changes else "dry-run"
        for thread in threads:
            self.stdout.write(
                f"{prefix}: /{thread.board.slug}/ «{thread.title}» "
                f"(#{thread.pk}, bumped {timezone.localdate(thread.bumped_at)})"
            )

        if apply_changes:
            hidden = Thread.objects.filter(pk__in=[t.pk for t in threads]).update(
                is_hidden=True
            )
            self.stdout.write(f"hid {hidden} threads")
        else:
            self.stdout.write(f"would hide {len(threads)} threads")
            self.stdout.write("dry run: nothing written, rerun with --apply")
