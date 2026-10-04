import pytest

from shared_money import Asi1Client, SplitwiseClient, SplitwiseError


class FakeResponse:
    def __init__(self, status_code, body):
        self.status_code, self._body = status_code, body

    def json(self):
        return self._body


class FakeHttp:
    def __init__(self, response):
        self.response, self.requests = response, []

    def get(self, url, **kwargs):
        self.requests.append(("GET", url, kwargs))
        return self.response

    def post(self, url, **kwargs):
        self.requests.append(("POST", url, kwargs))
        return self.response


def test_splitwise_get_group_uses_bearer_key():
    http = FakeHttp(FakeResponse(200, {"group": {"id": 7, "name": "MHacks Weekend", "members": []}}))

    group = SplitwiseClient("sw-key", http=http).get_group(7)

    assert group["name"] == "MHacks Weekend"
    method, url, kwargs = http.requests[0]
    assert (method, url) == ("GET", "https://secure.splitwise.com/api/v3.0/get_group/7")
    assert kwargs["headers"]["Authorization"] == "Bearer sw-key"


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(200, {"errors": {"base": ["Invalid API request: you do not have permission"]}}),
        FakeResponse(401, {"error": "Invalid API Request: you are not logged in"}),
        FakeResponse(200, {"group": None}),
    ],
)
def test_splitwise_errors_raise(response):
    with pytest.raises(SplitwiseError):
        SplitwiseClient("sw-key", http=FakeHttp(response)).get_group(7)


def test_asi1_complete_posts_chat_completion():
    http = FakeHttp(FakeResponse(200, {"choices": [{"message": {"content": "hello there"}}]}))

    reply = Asi1Client("asi-key", "https://asi.test/v1/", http=http).complete([{"role": "user", "content": "hi"}])

    assert reply == "hello there"
    method, url, kwargs = http.requests[0]
    assert (method, url) == ("POST", "https://asi.test/v1/chat/completions")
    assert kwargs["headers"]["Authorization"] == "Bearer asi-key"
    assert kwargs["json"]["model"] == "asi1"
