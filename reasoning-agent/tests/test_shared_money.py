import pytest

from shared_money import (
    Settings,
    SettingsError,
    SplitwiseError,
    respond_to_chat,
)

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
    ],
}


class FakeSplitwise:
    def __init__(self, group=GROUP, error=None):
        self.group, self.error, self.calls = group, error, []

    def get_group(self, group_id):
        self.calls.append(group_id)
        if self.error:
            raise self.error
        return self.group


class FakeAsi:
    def __init__(self, reply="Hi! I can see MHacks Weekend."):
        self.reply, self.calls = reply, []

    def complete(self, messages):
        self.calls.append(messages)
        return self.reply


class FakeStorage(dict):
    def set(self, key, value):
        self[key] = value

    def remove(self, key):
        self.pop(key, None)


def dm(text, sender=PHOTON):
    return {"sender": sender, "text": text, "metadata": {"kind": "dm_message", "message_id": "m1", "sender": "+1555"}}


def settings():
    return Settings.from_env(SECRETS)


def test_mentioned_dm_message_reads_group_and_replies_with_asi_one():
    splitwise, asi = FakeSplitwise(), FakeAsi()

    reply = respond_to_chat(**dm("@splitty hello"), settings=settings(), splitwise=splitwise, asi=asi, storage=FakeStorage())

    assert reply == "Hi! I can see MHacks Weekend."
    assert splitwise.calls == [4242]
    prompt = "\n".join(m["content"] for m in asi.calls[0])
    assert "MHacks Weekend" in prompt
    assert "Alex" in prompt and "Maya" in prompt
    assert asi.calls[0][-1] == {"role": "user", "content": "@splitty hello"}


def test_preflight_confirms_group_read_and_asi_one_in_a_checkable_reply():
    splitwise, asi = FakeSplitwise(), FakeAsi()

    reply = respond_to_chat(**dm("@splitty preflight"), settings=settings(), splitwise=splitwise, asi=asi, storage=FakeStorage())

    assert reply == 'PREFLIGHT OK group="MHacks Weekend" demo_user_member=yes asi1=yes'
    assert splitwise.calls == [4242] and len(asi.calls) == 1


def test_preflight_reports_failure_when_splitwise_is_unreadable():
    reply = respond_to_chat(
        **dm("@splitty preflight"),
        settings=settings(),
        splitwise=FakeSplitwise(error=SplitwiseError("nope")),
        asi=FakeAsi(),
        storage=FakeStorage(),
    )

    assert not reply.startswith("PREFLIGHT OK")


def test_dm_message_without_mention_is_ignored():
    splitwise, asi = FakeSplitwise(), FakeAsi()

    assert respond_to_chat(**dm("just chatting"), settings=settings(), splitwise=splitwise, asi=asi, storage=FakeStorage()) is None
    assert splitwise.calls == [] and asi.calls == []


def test_chat_from_another_agent_never_touches_the_demo_group():
    splitwise, asi = FakeSplitwise(), FakeAsi()

    reply = respond_to_chat(**dm("@splitty hello", sender="agent1qstranger"), settings=settings(), splitwise=splitwise, asi=asi, storage=FakeStorage())

    assert reply is not None and "iMessage" in reply
    assert splitwise.calls == [] and asi.calls == []


def test_splitwise_failure_is_reported_without_calling_asi_one():
    splitwise, asi = FakeSplitwise(error=SplitwiseError("Invalid API request")), FakeAsi()

    reply = respond_to_chat(**dm("@splitty hello"), settings=settings(), splitwise=splitwise, asi=asi, storage=FakeStorage())

    assert "Splitwise" in reply
    assert asi.calls == []


def test_splitwise_failure_reply_names_the_http_status():
    splitwise = FakeSplitwise(error=SplitwiseError("get_group failed (HTTP 401)"))

    reply = respond_to_chat(**dm("@splitty preflight"), settings=settings(), splitwise=splitwise, asi=FakeAsi(), storage=FakeStorage())

    assert "HTTP 401" in reply


def test_demo_user_missing_from_group_is_reported():
    group = {**GROUP, "members": GROUP["members"][1:]}
    asi = FakeAsi()

    reply = respond_to_chat(**dm("@splitty hello"), settings=settings(), splitwise=FakeSplitwise(group), asi=asi, storage=FakeStorage())

    assert "not a member" in reply
    assert asi.calls == []


def test_settings_name_missing_secrets_without_values():
    with pytest.raises(SettingsError) as error:
        Settings.from_env({"SPLITWISE_API_KEY": "sw-secret-value", "SPLITWISE_GROUP_ID": "abc"})
    message = str(error.value)
    for name in ("DEMO_USER_SPLITWISE_ID", "PHOTON_SENDER_ADDRESS", "ASI1_API_KEY", "ASI1_BASE_URL", "SPLITWISE_GROUP_ID"):
        assert name in message
    assert "sw-secret-value" not in message
