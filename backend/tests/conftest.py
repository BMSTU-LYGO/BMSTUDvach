import pytest
from rest_framework.test import APIClient


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def staff_client(django_user_model):
    user = django_user_model.objects.create_user(
        username="staff", password="testpass123", is_staff=True
    )
    client = APIClient()
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def board(db):
    from apps.forum.models import Board

    return Board.objects.create(slug="b", name="Разное")


@pytest.fixture
def thread_with_op(board):
    from apps.forum.models import Post, Thread

    thread = Thread.objects.create(board=board, title="Тестовый тред")
    op = Post.objects.create(thread=thread, body="Тело OP", is_op=True)
    return thread, op


@pytest.fixture
def thread(thread_with_op):
    return thread_with_op[0]


@pytest.fixture
def op_post(thread_with_op):
    return thread_with_op[1]
