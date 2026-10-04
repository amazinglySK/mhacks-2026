import json

import pytest
import requests

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
TACOS = ToolCall("record_expense", {"description": "Tacos", "amount": "20", "payer": "me", "participants": ["Alex"]})


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
    """Splitwise as the agent sees it; `expenses` is what a judge would see in the group."""

    def __init__(self, create_error=None):
        self.create_error, self.read_error, self.list_error = create_error, None, None
        self.reads, self.creates, self.expenses = [], [], []
        self.outcomes = []  # per create: None succeeds, an exception fails
        self.saved_despite = ()  # exception types raised after Splitwise already saved the Expense

    def get_group(self, group_id):
        self.reads.append(group_id)
        if self.read_error:
            raise self.read_error
        return GROUP

    def create_expense(self, payload):
        self.creates.append(payload)
        error = self.outcomes.pop(0) if self.outcomes else self.create_error
        expense_id = 9000 + len(self.creates)
        if error is None or isinstance(error, self.saved_despite):
            self.expenses.append(_splitwise_expense(expense_id, payload))
        if error:
            raise error
        return expense_id

    def list_expenses(self, group_id, updated_after):
        if self.list_error:
            raise self.list_error
        return self.expenses


def _splitwise_expense(expense_id, payload):
    users, i = [], 0
    while f"users__{i}__user_id" in payload:
        users.append(
            {
                "user_id": payload[f"users__{i}__user_id"],
                "paid_share": str(float(payload[f"users__{i}__paid_share"])),
                "owed_share": str(float(payload[f"users__{i}__owed_share"])),
            }
        )
        i += 1
    return {
        "id": expense_id,
        "description": payload["description"],
        "cost": str(float(payload["cost"])),
        "deleted_at": None,
        "users": users,
    }


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

    def say(self, text, message_id=None):
        self.count += 1
        self.last_message_id = message_id or f"m{self.count}"
        return respond_to_chat(
            sender=PHOTON,
            text=text,
            metadata={"kind": "dm_message", "message_id": self.last_message_id, "sender": "+1555"},
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


def stopped_batch(*calls, splitwise=None):
    chat = Chat(*calls, splitwise=splitwise)
    chat.say("@agent start listening")
    for _ in calls:
        chat.say("I paid for something with Alex")
    chat.say("@agent stop listening")
    return chat


def committed_line(reply):
    return next((line for line in reply.splitlines() if line.startswith("Committed")), "")


def failed_line(reply, description):
    return next((line for line in reply.splitlines() if line.startswith("Couldn't") and description in line), "")


def in_splitwise(splitwise):
    return [(e["description"], e["cost"]) for e in splitwise.expenses]


def test_one_rejected_draft_does_not_block_the_rest_of_the_batch():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [SplitwiseError("create_expense rejected: bad shares"), None]
    chat = stopped_batch(PIZZA, TACOS, splitwise=splitwise)

    reply = chat.say("commit")

    assert in_splitwise(splitwise) == [("Tacos", "20.0")]
    assert "Tacos" in committed_line(reply) and "Pizza" not in committed_line(reply)
    assert "bad shares" in failed_line(reply, "Pizza")
    assert "commit" in reply.splitlines()[-1].lower()


def test_each_success_is_stored_with_its_expense_id_and_commit_time():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [None, SplitwiseError("create_expense rejected: bad shares")]
    chat = stopped_batch(PIZZA, TACOS, splitwise=splitwise)

    chat.say("commit")

    [pizza] = chat.storage.get("committed_drafts")
    assert (pizza["description"], pizza["status"], pizza["splitwise_expense_id"]) == ("Pizza", "committed", 9001)
    assert pizza["committed_at"]


def test_retry_attempts_only_the_failures_and_a_later_commit_writes_nothing():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [SplitwiseError("create_expense rejected: bad shares"), None]
    chat = stopped_batch(PIZZA, TACOS, splitwise=splitwise)
    chat.say("commit")

    retry = chat.say("commit")

    assert sorted(in_splitwise(splitwise)) == [("Pizza", "30.0"), ("Tacos", "20.0")]
    assert "Pizza" in committed_line(retry) and "Tacos" not in retry
    assert chat.say("commit") is None
    assert len(splitwise.creates) == 3


def test_invalid_draft_is_never_sent_and_does_not_block_the_others():
    chat = stopped_batch(PIZZA, TACOS)
    session = chat.storage.get("listening_session")
    session["drafts"][0]["shares"][1]["owed_share"] = "-10.00"
    chat.storage.set("listening_session", session)

    reply = chat.say("commit")

    assert in_splitwise(chat.splitwise) == [("Tacos", "20.0")]
    assert [p["description"] for p in chat.splitwise.creates] == ["Tacos"]
    assert "negative" in failed_line(reply, "Pizza")


def test_redelivered_commit_does_not_retry_failed_drafts_on_its_own():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [SplitwiseError("create_expense rejected: bad shares"), None]
    chat = stopped_batch(PIZZA, TACOS, splitwise=splitwise)
    chat.say("commit")

    assert chat.say("commit", message_id=chat.last_message_id) is None
    assert len(splitwise.creates) == 2
    assert "Pizza" in committed_line(chat.say("commit"))


def test_timed_out_create_that_reached_splitwise_is_not_created_again():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [requests.ReadTimeout()]
    splitwise.saved_despite = (requests.Timeout,)
    chat = stopped_batch(PIZZA, splitwise=splitwise)

    assert failed_line(chat.say("commit"), "Pizza")
    retry = chat.say("commit")

    assert in_splitwise(splitwise) == [("Pizza", "30.0")]
    assert len(splitwise.creates) == 1
    assert "Pizza" in committed_line(retry)
    assert chat.storage.get("committed_drafts")[0]["splitwise_expense_id"] == 9001
    assert chat.say("commit") is None


def test_timed_out_create_that_never_arrived_is_sent_on_retry():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [requests.ReadTimeout()]
    chat = stopped_batch(PIZZA, splitwise=splitwise)
    chat.say("commit")

    retry = chat.say("commit")

    assert in_splitwise(splitwise) == [("Pizza", "30.0")]
    assert "Pizza" in committed_line(retry)


def test_retry_that_cannot_check_for_an_earlier_attempt_sends_nothing():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [requests.ReadTimeout()]
    chat = stopped_batch(PIZZA, splitwise=splitwise)
    chat.say("commit")
    splitwise.list_error = requests.ConnectionError()

    reply = chat.say("commit")

    assert len(splitwise.creates) == 1
    assert failed_line(reply, "Pizza")
    assert "commit" in reply.splitlines()[-1].lower()


def test_create_interrupted_after_splitwise_saved_it_is_not_created_again():
    class AgentDied(Exception):
        pass

    splitwise = FakeSplitwise()
    splitwise.outcomes = [AgentDied()]
    splitwise.saved_despite = (AgentDied,)
    chat = stopped_batch(PIZZA, splitwise=splitwise)
    with pytest.raises(AgentDied):
        chat.say("commit")

    assert "Pizza" in committed_line(chat.say("commit"))
    assert in_splitwise(splitwise) == [("Pizza", "30.0")]
    assert len(splitwise.creates) == 1


def test_old_commit_redelivered_into_a_later_batch_does_not_confirm_it():
    chat = stopped_batch(PIZZA, TACOS)
    chat.say("commit")
    old_commit = chat.last_message_id
    chat.asi.tool_calls = [PIZZA]
    chat.say("@agent start listening")
    chat.say("I paid $30 for pizza with Alex and Maya, split equally.")
    chat.say("@agent stop listening")

    assert chat.say("commit", message_id=old_commit) is None
    assert len(chat.splitwise.creates) == 2


def test_an_identical_expense_committed_earlier_is_not_mistaken_for_a_lost_attempt():
    splitwise = FakeSplitwise()
    splitwise.outcomes = [None, requests.ReadTimeout()]
    chat = stopped_batch(PIZZA, PIZZA, splitwise=splitwise)
    chat.say("commit")

    chat.say("commit")

    assert in_splitwise(splitwise) == [("Pizza", "30.0"), ("Pizza", "30.0")]
    assert [d["splitwise_expense_id"] for d in chat.storage.get("committed_drafts")] == [9001, 9003]
