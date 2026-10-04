import pytest

from shared_money import Asi1Client, Asi1Error, SplitwiseClient, SplitwiseError, ToolCall


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


def test_splitwise_create_expense_posts_payload_and_returns_expense_id():
    http = FakeHttp(FakeResponse(200, {"expenses": [{"id": 51023}], "errors": {}}))

    expense_id = SplitwiseClient("sw-key", http=http).create_expense({"group_id": 7, "cost": "30.00"})

    assert expense_id == 51023
    method, url, kwargs = http.requests[0]
    assert (method, url) == ("POST", "https://secure.splitwise.com/api/v3.0/create_expense")
    assert kwargs["json"] == {"group_id": 7, "cost": "30.00"}
    assert kwargs["headers"]["Authorization"] == "Bearer sw-key"


@pytest.mark.parametrize(
    "response",
    [
        FakeResponse(200, {"expenses": [], "errors": {"base": ["Shares do not add up"]}}),
        FakeResponse(400, {"errors": {"base": ["Unrecognized parameter `x`"]}}),
        FakeResponse(200, {"expenses": [], "errors": {}}),
        FakeResponse(200, {"expenses": [{"id": None}], "errors": {}}),
    ],
)
def test_splitwise_create_expense_without_an_id_raises(response):
    with pytest.raises(SplitwiseError):
        SplitwiseClient("sw-key", http=FakeHttp(response)).create_expense({})


def test_splitwise_create_expense_error_names_splitwise_reason():
    response = FakeResponse(200, {"expenses": [], "errors": {"base": ["Shares do not add up"]}})

    with pytest.raises(SplitwiseError, match="Shares do not add up"):
        SplitwiseClient("sw-key", http=FakeHttp(response)).create_expense({})


def test_asi1_choose_tool_parses_the_first_tool_call():
    tool_call = {"function": {"name": "record_expense", "arguments": '{"amount": "30"}'}}
    http = FakeHttp(FakeResponse(200, {"choices": [{"message": {"content": None, "tool_calls": [tool_call]}}]}))
    tools = [{"type": "function", "function": {"name": "record_expense"}}]

    call = Asi1Client("asi-key", "https://asi.test/v1", http=http).choose_tool([{"role": "user", "content": "hi"}], tools)

    assert call == ToolCall("record_expense", {"amount": "30"})
    assert http.requests[0][2]["json"]["tools"] == tools


def test_asi1_choose_tool_returns_none_without_a_tool_call():
    http = FakeHttp(FakeResponse(200, {"choices": [{"message": {"content": "just chatting"}}]}))

    assert Asi1Client("asi-key", "https://asi.test/v1", http=http).choose_tool([], []) is None


def test_asi1_choose_tool_raises_on_http_error():
    http = FakeHttp(FakeResponse(500, {"error": "boom"}))

    with pytest.raises(Asi1Error):
        Asi1Client("asi-key", "https://asi.test/v1", http=http).choose_tool([], [])


def test_asi1_complete_posts_chat_completion():
    http = FakeHttp(FakeResponse(200, {"choices": [{"message": {"content": "hello there"}}]}))

    reply = Asi1Client("asi-key", "https://asi.test/v1/", http=http).complete([{"role": "user", "content": "hi"}])

    assert reply == "hello there"
    method, url, kwargs = http.requests[0]
    assert (method, url) == ("POST", "https://asi.test/v1/chat/completions")
    assert kwargs["headers"]["Authorization"] == "Bearer asi-key"
    assert kwargs["json"]["model"] == "asi1"
