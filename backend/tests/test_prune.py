from datetime import timedelta
from io import StringIO

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.utils import timezone

from apps.forum.models import Board, Post, Thread


def add_thread(
    board,
    title,
    *,
    days_ago=0,
    pinned=False,
    locked=False,
    hidden=False,
) -> Thread:
    """A thread whose last bump sits `days_ago` days in the past."""
    now = timezone.now()
    thread = Thread.objects.create(
        board=board,
        title=title,
        bumped_at=now - timedelta(days=days_ago, minutes=5),
        is_pinned=pinned,
        is_locked=locked,
        is_hidden=hidden,
    )
    Post.objects.create(thread=thread, body="Тело OP", is_op=True)
    Thread.objects.filter(pk=thread.pk).update(created_at=now - timedelta(days=200))
    return thread


@pytest.fixture
def boards(db):
    return (
        Board.objects.create(slug="b", name="Разное"),
        Board.objects.create(slug="study", name="Учёба"),
    )


def prune(*args) -> str:
    out = StringIO()
    call_command("prune_threads", *args, stdout=out)
    return out.getvalue()


class TestPruneThreads:
    @pytest.mark.django_db
    def test_apply_hides_stale_thread(self, boards):
        stale = add_thread(boards[0], "Мёртвый тред", days_ago=120)
        call_command("prune_threads", "--days", "90", "--apply")
        stale.refresh_from_db()
        assert stale.is_hidden is True

    @pytest.mark.django_db
    def test_fresh_thread_survives(self, boards):
        fresh = add_thread(boards[0], "Живой тред", days_ago=1)
        out = prune("--days", "90", "--apply")
        fresh.refresh_from_db()
        assert fresh.is_hidden is False
        assert "nothing to prune" in out

    @pytest.mark.django_db
    def test_dry_run_writes_nothing(self, boards):
        stale = add_thread(boards[0], "Мёртвый тред", days_ago=120)
        out = prune("--days", "90")
        stale.refresh_from_db()
        assert stale.is_hidden is False
        assert f"dry-run: /b/ «Мёртвый тред» (#{stale.pk}, bumped" in out
        assert "would hide 1 threads" in out
        assert "nothing written" in out

    @pytest.mark.django_db
    def test_pinned_thread_is_never_touched(self, boards):
        pinned = add_thread(boards[0], "Закреп", days_ago=400, pinned=True)
        out = prune("--days", "90", "--apply")
        pinned.refresh_from_db()
        assert pinned.is_hidden is False
        assert "nothing to prune" in out

    @pytest.mark.django_db
    def test_locked_thread_can_still_be_hidden(self, boards):
        locked = add_thread(boards[0], "Закрытый", days_ago=120, locked=True)
        out = prune("--days", "90", "--apply")
        locked.refresh_from_db()
        assert locked.is_hidden is True
        assert "hid 1 threads" in out

    @pytest.mark.django_db
    def test_board_argument_limits_scope(self, boards):
        mine = add_thread(boards[0], "Мой", days_ago=120)
        other = add_thread(boards[1], "Чужой", days_ago=120)
        out = prune("--days", "90", "--apply", "--board", "b")
        mine.refresh_from_db()
        other.refresh_from_db()
        assert mine.is_hidden is True
        assert other.is_hidden is False
        assert "hid 1 threads" in out

    @pytest.mark.django_db
    def test_inactive_board_is_skipped(self, db):
        board = Board.objects.create(
            slug="dead", name="Закрытый раздел", is_active=False
        )
        thread = add_thread(board, "Заброшенный", days_ago=300)
        out = prune("--days", "90", "--apply")
        thread.refresh_from_db()
        assert thread.is_hidden is False
        assert "nothing to prune" in out

    @pytest.mark.django_db
    def test_days_must_be_positive(self, boards):
        stale = add_thread(boards[0], "Мёртвый тред", days_ago=120)
        for bad in ("0", "-5", "abc"):
            with pytest.raises(CommandError):
                call_command("prune_threads", "--days", bad, "--apply")
        stale.refresh_from_db()
        assert stale.is_hidden is False

    @pytest.mark.django_db
    def test_big_days_hides_nothing(self, boards):
        stale = add_thread(boards[0], "Мёртвый тред", days_ago=120)
        out = prune("--days", "100000", "--apply")
        stale.refresh_from_db()
        assert stale.is_hidden is False
        assert "nothing to prune" in out

    @pytest.mark.django_db
    def test_explicit_dry_run_flag_is_a_noop(self, boards):
        stale = add_thread(boards[0], "Мёртвый тред", days_ago=120)
        out = prune("--days", "90", "--dry-run")
        stale.refresh_from_db()
        assert stale.is_hidden is False
        assert "would hide 1 threads" in out

    @pytest.mark.django_db
    def test_apply_and_dry_run_conflict(self, boards):
        stale = add_thread(boards[0], "Мёртвый тред", days_ago=120)
        with pytest.raises(CommandError):
            call_command("prune_threads", "--days", "90", "--apply", "--dry-run")
        stale.refresh_from_db()
        assert stale.is_hidden is False

    @pytest.mark.django_db
    def test_limit_caps_the_batch(self, boards):
        oldest = add_thread(boards[0], "Самый старый", days_ago=300)
        older = add_thread(boards[0], "Старый", days_ago=200)
        old = add_thread(boards[0], "Старый", days_ago=120)
        out = prune("--days", "90", "--apply", "--limit", "2")
        for thread in (oldest, older, old):
            thread.refresh_from_db()
        assert oldest.is_hidden is True
        assert older.is_hidden is True
        assert old.is_hidden is False
        assert "hid 2 threads" in out

    @pytest.mark.django_db
    def test_apply_is_idempotent(self, boards):
        add_thread(boards[0], "Мёртвый тред", days_ago=120)
        first = prune("--days", "90", "--apply")
        second = prune("--days", "90", "--apply")
        assert "hid 1 threads" in first
        assert "nothing to prune" in second

    @pytest.mark.django_db
    def test_apply_does_not_touch_updated_at(self, boards):
        stale = add_thread(boards[0], "Мёртвый тред", days_ago=120)
        stamp = stale.updated_at
        prune("--days", "90", "--apply")
        stale.refresh_from_db()
        assert stale.is_hidden is True
        assert stale.updated_at == stamp
