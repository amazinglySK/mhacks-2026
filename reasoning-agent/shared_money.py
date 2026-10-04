"""Reasoning Agent behaviour, independent of the uAgents runtime so it can be tested locally."""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

import requests

SPLITWISE_API = "https://secure.splitwise.com/api/v3.0"
ASI1_MODEL = "asi1"
MENTION = "@agent"
HTTP_TIMEOUT_SECONDS = 20

REQUIRED_SECRETS = (
    "SPLITWISE_API_KEY",
    "SPLITWISE_GROUP_ID",
    "DEMO_USER_SPLITWISE_ID",
    "PHOTON_SENDER_ADDRESS",
    "ASI1_API_KEY",
    "ASI1_BASE_URL",
)

NOT_PHOTON_REPLY = (
    "I'm the Shared-Money Agent. I record shared Expenses in Splitwise from one "
    "configured iMessage DM, so I can't act on messages from here."
)


class SettingsError(Exception):
    pass


class SplitwiseError(Exception):
    pass


class Asi1Error(Exception):
    pass


@dataclass(frozen=True)
class Settings:
    splitwise_api_key: str
    splitwise_group_id: int
    demo_user_splitwise_id: int
    photon_sender_address: str
    asi1_api_key: str
    asi1_base_url: str

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Settings":
        """Reads Agentverse secrets. Errors name the secrets, never their values."""
        env = os.environ if env is None else env
        values = {name: (env.get(name) or "").strip() for name in REQUIRED_SECRETS}
        missing = [name for name, value in values.items() if not value]
        not_numeric = [
            name
            for name in ("SPLITWISE_GROUP_ID", "DEMO_USER_SPLITWISE_ID")
            if values[name] and not values[name].isdigit()
        ]
        if missing or not_numeric:
            problems = []
            if missing:
                problems.append(f"missing {', '.join(missing)}")
            if not_numeric:
                problems.append(f"not numeric: {', '.join(not_numeric)}")
            raise SettingsError(f"Invalid Reasoning Agent secrets: {'; '.join(problems)}")
        return cls(
            splitwise_api_key=values["SPLITWISE_API_KEY"],
            splitwise_group_id=int(values["SPLITWISE_GROUP_ID"]),
            demo_user_splitwise_id=int(values["DEMO_USER_SPLITWISE_ID"]),
            photon_sender_address=values["PHOTON_SENDER_ADDRESS"],
            asi1_api_key=values["ASI1_API_KEY"],
            asi1_base_url=values["ASI1_BASE_URL"],
        )


class HttpClient(Protocol):
    def get(self, url: str, **kwargs: Any) -> Any: ...
    def post(self, url: str, **kwargs: Any) -> Any: ...


class SplitwiseClient:
    def __init__(self, api_key: str, http: HttpClient = requests):
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._http = http

    def get_group(self, group_id: int) -> dict:
        response = self._http.get(
            f"{SPLITWISE_API}/get_group/{group_id}", headers=self._headers, timeout=HTTP_TIMEOUT_SECONDS
        )
        body = _json(response)
        # Splitwise can report application errors with HTTP 200.
        if response.status_code != 200 or body.get("errors") or body.get("error"):
            raise SplitwiseError(f"get_group failed (HTTP {response.status_code})")
        group = body.get("group")
        if not isinstance(group, dict):
            raise SplitwiseError("get_group returned no group")
        return group


class Asi1Client:
    def __init__(self, api_key: str, base_url: str, http: HttpClient = requests):
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._http = http

    def complete(self, messages: list[dict]) -> str:
        response = self._http.post(
            self._url,
            headers=self._headers,
            json={"model": ASI1_MODEL, "messages": messages, "max_tokens": 400},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        body = _json(response)
        try:
            content = body["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise Asi1Error(f"ASI:One returned no completion (HTTP {response.status_code})") from None
        if response.status_code != 200 or not content:
            raise Asi1Error(f"ASI:One completion failed (HTTP {response.status_code})")
        return content.strip()


class GroupReader(Protocol):
    def get_group(self, group_id: int) -> dict: ...


class Completer(Protocol):
    def complete(self, messages: list[dict]) -> str: ...


def respond_to_chat(
    *,
    sender: str,
    text: str,
    metadata: Mapping[str, str],
    settings: Settings,
    splitwise: GroupReader,
    asi: Completer,
) -> str | None:
    """Returns the reply for one Agent Chat Protocol message, or None when the agent stays silent."""
    if sender != settings.photon_sender_address or metadata.get("kind") != "dm_message":
        return NOT_PHOTON_REPLY
    if MENTION not in text.lower():
        return None

    try:
        group = splitwise.get_group(settings.splitwise_group_id)
    except (SplitwiseError, requests.RequestException):
        return "I couldn't read the Splitwise group just now. Check the Splitwise secrets and try again."

    members = group.get("members") or []
    if not any(member.get("id") == settings.demo_user_splitwise_id for member in members):
        return f"The demo user is not a member of the Splitwise group \"{group.get('name')}\", so I can't record Expenses there."

    try:
        return asi.complete(_walking_prompt(group, text))
    except (Asi1Error, requests.RequestException):
        return f"I can see the Splitwise group \"{group.get('name')}\", but ASI:One didn't answer. Try again in a moment."


def _walking_prompt(group: dict, text: str) -> list[dict]:
    names = ", ".join(_full_name(m) for m in group.get("members") or [])
    system = (
        "You are the Shared-Money Agent, replying inside an iMessage DM. You will soon help record shared "
        "Expenses in Splitwise; for now, greet the user briefly and confirm which Splitwise group you are "
        f"connected to. Splitwise group: \"{group.get('name')}\". Group members: {names}. "
        "Reply in at most two short sentences of plain text."
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": text}]


def _full_name(member: dict) -> str:
    return " ".join(part for part in (member.get("first_name"), member.get("last_name")) if part)


def _json(response: Any) -> dict:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}
