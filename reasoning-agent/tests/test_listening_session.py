import json

import pytest

from shared_money import Settings, SplitwiseError, ToolCall, respond_to_chat

PHOTON = "agent1qphoton"
SECRETS = {
    "SPLITWISE_API_KEY": "sw-key",
    "SPLITWISE_GROUP_ID": "4242",
    "DEMO_USER_SPLITWISE_ID": "100",
    "PHOTON_SENDER_ADDRESS": PHOTON,
    "ASI1_API_KEY": "asi-key",
    "ASI1_BASE_URL": "https://asi.test/v1",
}
GROUP = {
    "id": 4242,
    "name": "MHacks Weekend",
    "members": [
        {"id": 100, "first_name": "Demo", "last_name": "User"},
        {"id": 101, "first_name": "Alex", "last_name": None},
        {"id": 102, "first_name": "Maya", "last_name": "Lee"},
        {"id": 103, "first_name": "Sam", "last_name": "Park"},
        {"id": 104, "first_name": "Sam", "last_name": "Ortiz"},
    ],
}
PIZZA = ToolCall(
    "record_expense", {"description": "Pizza", "amount": "30", "payer": "me", "participants": ["Alex", "Maya"]}
)


class FakeStorage:
    def __init__(self):
        self.data = {}

    def get(self, key):
        return json.loads(self.data[key]) if key in self.data else None

    def set(self, key, value):
        self.data[key] = json.dumps(value)

    def remove(self, key):
        self.data.pop(key, None)


class FakeSplitwise:
    def __init__(self, create_error=None):
        self.create_error, self.read_error, self.reads, self.creates = create_error, None, [], []

    def get_group(self, group_id):
        self.reads.append(group_id)
        if self.read_error:
            raise self.read_error
        return GROUP

    def create_expense(self, payload):
        self.creates.append(payload)
        if self.create_error:
            raise self.create_error
        return 9000 + len(self.creates)


class FakeAsi:
    def __init__(self, *tool_calls):
        self.tool_calls, self.calls = list(tool_calls), []

    def complete(self, messages):
        return "Hi!"

    def choose_tool(self, messages, tools):
        self.calls.append(messages)
        return self.tool_calls.pop(0) if self.tool_calls else None


class Chat:
    def __init__(self, *tool_calls, splitwise=None):
        self.storage, self.splitwise, self.asi = FakeStorage(), splitwise or FakeSplitwise(), FakeAsi(*tool_calls)
        self.count = 0

    def say(self, text):
        self.count += 1
        return respond_to_chat(
            sender=PHOTON,
            text=text,
            metadata={"kind": "dm_message", "message_id": f"m{self.count}", "sender": "+1555"},
            settings=Settings.from_env(SECRETS),
            splitwise=self.splitwise,
            asi=self.asi,
            storage=self.storage,
        )


def test_start_listening_acknowledges_once_and_reports_duplicate_start():
    chat = Chat()

    first = chat.say("@agent start listening")
    second = chat.say("@agent start listening")

    assert "listening" in first.lower()
    assert "already" in second.lower()
    assert chat.splitwise.creates == []


def test_ordinary_message_outside_a_session_is_ignored():
    chat = Chat(PIZZA)

    assert chat.say("I paid $30 for pizza with Alex and Maya, split equally.") is None
    assert chat.asi.calls == []


def test_complete_expense_in_session_becomes_a_draft_summary_without_writing():
    chat = Chat(PIZZA)
    chat.say("@agent start listening")

    reply = chat.say("I paid $30 for pizza with Alex and Maya, split equally.")

    for fact in ("Pizza", "$30.00", "Demo User", "Alex", "Maya Lee", "$10.00", "MHacks Weekend"):
        assert fact in reply
    assert chat.splitwise.creates == []


def test_non_expense_chatter_in_session_stays_silent():
    chat = Chat()
    chat.say("@agent start listening")

    assert chat.say("lol that movie was great") is None
    assert len(chat.asi.calls) == 1


def test_clarifying_question_from_asi_one_is_relayed_without_a_draft():
    chat = Chat(ToolCall("ask_user", {"question": "How much was the pizza?"}))
    chat.say("@agent start listening")

    assert chat.say("I got pizza for Alex and me") == "How much was the pizza?"
    assert "nothing to record" in chat.say("@agent stop listening").lower()


@pytest.mark.parametrize("amount", [None, "", "abc", "0", "-5"])
def test_missing_or_invalid_amount_is_asked_for_never_guessed(amount):
    call = ToolCall("record_expense", {"description": "Pizza", "amount": amount, "payer": "me", "participants": ["Alex"]})
    chat = Chat(call)
    chat.say("@agent start listening")

    reply = chat.say("I got pizza for Alex")

    assert "how much" in reply.lower()
    assert "nothing to record" in chat.say("@agent stop listening").lower()


def test_unknown_participant_blocks_the_draft():
    call = ToolCall("record_expense", {"description": "Pizza", "amount": "30", "payer": "me", "participants": ["Zed"]})
    chat = Chat(call)
    chat.say("@agent start listening")

    reply = chat.say("I paid $30 for pizza with Zed")

    assert "Zed" in reply and "MHacks Weekend" in reply
    assert "nothing to record" in chat.say("@agent stop listening").lower()


def test_ambiguous_first_name_blocks_the_draft_and_names_the_choices():
    call = ToolCall("record_expense", {"description": "Taxi", "amount": "20", "payer": "me", "participants": ["Sam"]})
    chat = Chat(call)
    chat.say("@agent start listening")

    reply = chat.say("I paid $20 for a taxi with Sam")

    assert "Sam Park" in reply and "Sam Ortiz" in reply
    assert "nothing to record" in chat.say("@agent stop listening").lower()


def test_participant_names_match_case_and_full_name_insensitively():
    call = ToolCall("record_expense", {"description": "Taxi", "amount": "20", "payer": "me", "participants": ["sam  PARK"]})
    chat = Chat(call)
    chat.say("@agent start listening")

    assert "Sam Park" in chat.say("I paid $20 for a taxi with sam park")


def test_stop_returns_batch_summary_and_writes_nothing():
    chat = Chat(PIZZA)
    chat.say("@agent start listening")
    chat.say("I paid $30 for pizza with Alex and Maya, split equally.")

    reply = chat.say("@agent stop listening")

    assert "Pizza" in reply and "$30.00" in reply and "commit" in reply.lower()
    assert chat.splitwise.creates == []


def test_stopped_session_ignores_modification_and_non_confirming_reply():
    chat = Chat(PIZZA, ToolCall("record_expense", {**PIZZA.arguments, "description": "Tacos"}))
    chat.say("@agent start listening")
    chat.say("I paid $30 for pizza with Alex and Maya, split equally.")
    chat.say("@agent stop listening")

    assert chat.say("I also paid $30 for tacos with Alex and Maya") is None
    assert chat.say("sounds good") is None
    assert "commit" in chat.say("@agent did you get that?").lower()
    assert chat.splitwise.creates == []
    assert len(chat.asi.calls) == 1


def test_commit_creates_one_expense_with_complete_by_shares_data():
    chat = Chat(PIZZA)
    chat.say("@agent start listening")
    chat.say("I paid $30 for pizza with Alex and Maya, split equally.")
    chat.say("@agent stop listening")

    reply = chat.say("commit")

    assert chat.splitwise.creates == [
        {
            "group_id": 4242,
            "cost": "30.00",
            "description": "Pizza",
            "currency_code": "USD",
            "users__0__user_id": 100,
            "users__0__paid_share": "30.00",
            "users__0__owed_share": "10.00",
            "users__1__user_id": 101,
            "users__1__paid_share": "0.00",
            "users__1__owed_share": "10.00",
            "users__2__user_id": 102,
            "users__2__paid_share": "0.00",
            "users__2__owed_share": "10.00",
        }
    ]
    assert "Pizza" in reply and "Splitwise" in reply
    assert "9001" in json.dumps(chat.storage.data)


def test_commit_after_success_ends_the_session_without_another_write():
    chat = Chat(PIZZA)
    chat.say("@agent start listening")
    chat.say("I paid $30 for pizza with Alex and Maya, split equally.")
    chat.say("@agent stop listening")
    chat.say("commit")

    assert chat.say("commit") is None
    assert len(chat.splitwise.creates) == 1
    assert "listening" in chat.say("@agent start listening").lower()


def test_equal_split_remainder_goes_to_the_payers_owed_share():
    chat = Chat(ToolCall("record_expense", {"description": "Snacks", "amount": "10", "payer": "me", "participants": ["Alex", "Maya"]}))
    chat.say("@agent start listening")
    chat.say("I paid $10 for snacks with Alex and Maya")
    chat.say("@agent stop listening")
    chat.say("commit")

    payload = chat.splitwise.creates[0]
    assert [payload[f"users__{i}__owed_share"] for i in range(3)] == ["3.34", "3.33", "3.33"]


def test_named_payer_pays_and_the_sender_is_a_participant():
    chat = Chat(ToolCall("record_expense", {"description": "Gas", "amount": "20", "payer": "Alex", "participants": ["me"]}))
    chat.say("@agent start listening")
    chat.say("Alex paid $20 for gas for me")
    chat.say("@agent stop listening")
    chat.say("commit")

    payload = chat.splitwise.creates[0]
    assert (payload["users__0__user_id"], payload["users__0__paid_share"]) == (101, "20.00")
    assert (payload["users__1__user_id"], payload["users__1__paid_share"], payload["users__1__owed_share"]) == (100, "0.00", "10.00")


def test_stopping_an_empty_session_never_contacts_splitwise():
    chat = Chat()
    chat.say("@agent start listening")

    reply = chat.say("@agent stop listening")

    assert "nothing to record" in reply.lower()
    assert chat.splitwise.reads == [] and chat.splitwise.creates == []
    assert chat.say("commit") is None


def test_failed_commit_is_reported_and_stays_uncommitted():
    chat = Chat(PIZZA, splitwise=FakeSplitwise(create_error=SplitwiseError("create_expense rejected: bad shares")))
    chat.say("@agent start listening")
    chat.say("I paid $30 for pizza with Alex and Maya, split equally.")
    chat.say("@agent stop listening")

    reply = chat.say("commit")

    assert "Pizza" in reply and "bad shares" in reply
    assert "commit" in chat.say("@agent hmm").lower()


def test_stop_that_cannot_read_splitwise_keeps_listening_so_stop_can_be_retried():
    chat = Chat(PIZZA)
    chat.say("@agent start listening")
    chat.say("I paid $30 for pizza with Alex and Maya, split equally.")
    chat.splitwise.read_error = SplitwiseError("get_group failed (HTTP 503)")

    assert "HTTP 503" in chat.say("@agent stop listening")

    chat.splitwise.read_error = None
    assert "Pizza" in chat.say("@agent stop listening")


def test_commands_must_be_the_whole_message():
    chat = Chat()
    chat.say("@agent start listening!")

    assert chat.say("don't @agent stop listening yet") is None
    assert "already" in chat.say("@agent start listening").lower()


def test_amount_too_small_to_split_is_rejected_before_it_becomes_a_draft():
    call = ToolCall("record_expense", {"description": "Gum", "amount": "0.03", "payer": "me", "participants": ["Alex", "Maya", "Sam Park", "Sam Ortiz"]})
    chat = Chat(call)
    chat.say("@agent start listening")

    assert "can't split" in chat.say("I paid 3 cents for gum with everyone")
    assert "nothing to record" in chat.say("@agent stop listening").lower()
