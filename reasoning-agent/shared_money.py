"""Reasoning Agent behaviour, independent of the uAgents runtime so it can be tested locally."""

import json
import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, Mapping, Protocol

import requests

SPLITWISE_API = "https://secure.splitwise.com/api/v3.0"
ASI1_MODEL = "asi1"
MENTION = "@agent"
PREFLIGHT_COMMAND = "@agent preflight"
START_COMMAND = "@agent start listening"
STOP_COMMAND = "@agent stop listening"
COMMIT_COMMAND = "commit"
HTTP_TIMEOUT_SECONDS = 20

SESSION_KEY = "listening_session"
COMMITTED_KEY = "committed_drafts"
HANDLED_COMMITS_KEY = "handled_commit_message_ids"
HANDLED_COMMITS_LIMIT = 50
CURRENCY_CODE = "USD"
CENT = Decimal("0.01")
TRANSCRIPT_LIMIT = 30
# Splitwise timestamps come from its clock, not Agentverse's.
ATTEMPT_CLOCK_SKEW = timedelta(minutes=5)
SELF_REFERENCES = {"me", "i", "myself"}

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
AWAITING_COMMIT_REPLY = "Nothing has been written to Splitwise. Reply commit to record the stopped batch."


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

    def list_expenses(self, group_id: int, updated_after: str) -> list[dict]:
        response = self._http.get(
            f"{SPLITWISE_API}/get_expenses",
            headers=self._headers,
            params={"group_id": group_id, "updated_after": updated_after, "limit": 100},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        body = _json(response)
        if response.status_code != 200 or body.get("errors") or body.get("error"):
            raise SplitwiseError(f"get_expenses failed (HTTP {response.status_code})")
        expenses = body.get("expenses")
        if not isinstance(expenses, list):
            raise SplitwiseError("get_expenses returned no expenses")
        return [expense for expense in expenses if isinstance(expense, dict)]

    def create_expense(self, payload: dict) -> int:
        """Creates one Expense; succeeds only when Splitwise returns no errors and an Expense ID."""
        response = self._http.post(
            f"{SPLITWISE_API}/create_expense", headers=self._headers, json=payload, timeout=HTTP_TIMEOUT_SECONDS
        )
        body = _json(response)
        errors = body.get("errors") or body.get("error")
        if errors:
            raise SplitwiseError(f"create_expense rejected: {_error_text(errors)}")
        expenses = body.get("expenses")
        expense_id = expenses[0].get("id") if isinstance(expenses, list) and expenses else None
        if response.status_code != 200 or not isinstance(expense_id, int):
            raise SplitwiseError(f"create_expense returned no Expense ID (HTTP {response.status_code})")
        return expense_id


@dataclass(frozen=True)
class ToolCall:
    name: str
    arguments: dict


class Asi1Client:
    def __init__(self, api_key: str, base_url: str, http: HttpClient = requests):
        self._headers = {"Authorization": f"Bearer {api_key}"}
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._http = http

    def complete(self, messages: list[dict]) -> str:
        message = self._post({"messages": messages})
        content = message.get("content")
        if not content:
            raise Asi1Error("ASI:One returned an empty completion")
        return content.strip()

    def choose_tool(self, messages: list[dict], tools: list[dict]) -> ToolCall | None:
        """Returns the first tool ASI:One chose to call, or None when it answered without one."""
        message = self._post({"messages": messages, "tools": tools, "tool_choice": "auto"})
        for call in message.get("tool_calls") or []:
            function = call.get("function") or {}
            arguments = function.get("arguments") or {}
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments)
                except ValueError:
                    raise Asi1Error("ASI:One returned unreadable tool arguments") from None
            if function.get("name") and isinstance(arguments, dict):
                return ToolCall(function["name"], arguments)
        return None

    def _post(self, body: dict) -> dict:
        response = self._http.post(
            self._url,
            headers=self._headers,
            json={"model": ASI1_MODEL, "max_tokens": 400, **body},
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        try:
            message = _json(response)["choices"][0]["message"]
        except (KeyError, IndexError, TypeError):
            raise Asi1Error(f"ASI:One returned no completion (HTTP {response.status_code})") from None
        if response.status_code != 200 or not isinstance(message, dict):
            raise Asi1Error(f"ASI:One completion failed (HTTP {response.status_code})")
        return message


class SplitwiseService(Protocol):
    def get_group(self, group_id: int) -> dict: ...
    def list_expenses(self, group_id: int, updated_after: str) -> list[dict]: ...
    def create_expense(self, payload: dict) -> int: ...


class Reasoner(Protocol):
    def complete(self, messages: list[dict]) -> str: ...
    def choose_tool(self, messages: list[dict], tools: list[dict]) -> ToolCall | None: ...


class Storage(Protocol):
    """The subset of uAgents Agent Storage the Reasoning Agent uses; values must be JSON-serialisable."""

    def get(self, key: str) -> Any: ...
    def set(self, key: str, value: Any) -> None: ...
    def remove(self, key: str) -> None: ...


class _Reply(Exception):
    """Ends handling early with a user-visible reply."""


def respond_to_chat(
    *,
    sender: str,
    text: str,
    metadata: Mapping[str, str],
    settings: Settings,
    splitwise: SplitwiseService,
    asi: Reasoner,
    storage: Storage,
) -> str | None:
    """Returns the reply for one Agent Chat Protocol message, or None when the agent stays silent."""
    if sender != settings.photon_sender_address or metadata.get("kind") != "dm_message":
        return NOT_PHOTON_REPLY

    command = " ".join(text.lower().split()).rstrip(".!?")
    session = storage.get(SESSION_KEY)
    try:
        if command == PREFLIGHT_COMMAND:
            return _connection_reply(text, settings, splitwise, asi, preflight=True)
        if command == START_COMMAND:
            return _start(session, storage)
        if command == STOP_COMMAND:
            return _stop(session, settings, splitwise, storage)
        if session is None:
            return _connection_reply(text, settings, splitwise, asi) if MENTION in command else None
        if session["status"] == "stopped":
            if command == COMMIT_COMMAND:
                return _commit(session, metadata.get("message_id", ""), settings, splitwise, storage)
            return AWAITING_COMMIT_REPLY if MENTION in command else None
        return _interpret(text, metadata, session, settings, splitwise, asi, storage)
    except _Reply as reply:
        return str(reply)


def _start(session: dict | None, storage: Storage) -> str:
    if session is not None and session["status"] == "active":
        return "A Listening Session is already active. Tell me about shared Expenses, then say @agent stop listening."
    if session is not None:
        return AWAITING_COMMIT_REPLY
    storage.set(SESSION_KEY, {"status": "active", "transcript": [], "drafts": []})
    return "Listening Session started. Tell me about shared Expenses and I'll keep Drafts until you say @agent stop listening."


def _stop(session: dict | None, settings: Settings, splitwise: SplitwiseService, storage: Storage) -> str:
    if session is None:
        return "No Listening Session is active. Say @agent start listening to begin."
    if session["status"] == "stopped":
        return AWAITING_COMMIT_REPLY
    if not _uncommitted(session):
        storage.remove(SESSION_KEY)
        return "Stopped listening. There were no Drafts, so there is nothing to record in Splitwise."

    group = _load_group(settings, splitwise)
    session["status"] = "stopped"
    session["transcript"] = []
    storage.set(SESSION_KEY, session)
    drafts = _uncommitted(session)
    lines = [f"Stopped listening. {len(drafts)} Draft{'s' if len(drafts) != 1 else ''} for {group.get('name')}:"]
    lines += [f"{i}. {_describe(draft, group)}" for i, draft in enumerate(drafts, start=1)]
    lines.append("Nothing has been written yet. Reply commit to record this in Splitwise.")
    return "\n".join(lines)


def _commit(
    session: dict, message_id: str, settings: Settings, splitwise: SplitwiseService, storage: Storage
) -> str | None:
    """Best-effort Commit of every uncommitted Draft; a redelivered confirmation message is ignored."""
    handled = storage.get(HANDLED_COMMITS_KEY) or []
    if message_id and message_id in handled:
        return None
    group = _load_group(settings, splitwise)
    if message_id:
        storage.set(HANDLED_COMMITS_KEY, [*handled, message_id][-HANDLED_COMMITS_LIMIT:])

    committed, failed = [], []
    for draft in _uncommitted(session):
        problems = validate_draft(draft)
        if problems:
            failed.append((draft, "; ".join(problems)))
            continue
        try:
            expense_id = _find_saved_attempt(draft, session, settings, splitwise, storage)
        except (SplitwiseError, requests.RequestException) as error:
            reason = _failure_reason(error)
            failed.append((draft, f"I couldn't check whether an earlier try reached Splitwise ({reason}), so I didn't resend it"))
            continue
        if expense_id is None:
            # Saved before sending: the create may land even if this handler never hears back.
            draft.setdefault("first_attempted_at", _now())
            storage.set(SESSION_KEY, session)
            try:
                expense_id = splitwise.create_expense(draft_to_create_expense_payload(draft, settings.splitwise_group_id))
            except (SplitwiseError, requests.RequestException) as error:
                failed.append((draft, _failure_reason(error)))
                continue
        now = _now()
        draft.update(status="committed", splitwise_expense_id=expense_id, committed_at=now, updated_at=now)
        storage.set(SESSION_KEY, session)
        storage.set(COMMITTED_KEY, [*(storage.get(COMMITTED_KEY) or []), draft])
        committed.append(draft)

    if not _uncommitted(session):
        storage.remove(SESSION_KEY)

    lines = []
    if committed:
        names = ", ".join(f"{d['description']} ${d['amount']}" for d in committed)
        lines.append(f"Committed to Splitwise in {group.get('name')}: {names}. Open Splitwise to see it.")
    for draft, reason in failed:
        lines.append(f"Couldn't record {draft['description']} ${draft['amount']}: {reason}.")
    if failed:
        lines.append("Those Drafts are still uncommitted. Reply commit to retry.")
    return "\n".join(lines)


def _find_saved_attempt(
    draft: dict, session: dict, settings: Settings, splitwise: SplitwiseService, storage: Storage
) -> int | None:
    """The Expense an earlier unconfirmed create may have saved anyway (e.g. a timeout after Splitwise wrote it)."""
    if not draft.get("first_attempted_at"):
        return None
    since = datetime.fromisoformat(draft["first_attempted_at"]) - ATTEMPT_CLOCK_SKEW
    known = {d.get("splitwise_expense_id") for d in [*(storage.get(COMMITTED_KEY) or []), *session["drafts"]]}
    wanted = (draft["description"], _decimal(draft["amount"]), _share_key(draft["shares"]))
    for expense in splitwise.list_expenses(settings.splitwise_group_id, since.isoformat()):
        if expense.get("id") in known or expense.get("deleted_at"):
            continue
        found = (
            str(expense.get("description") or "").strip(),
            _decimal(expense.get("cost")),
            _share_key(expense.get("users") or []),
        )
        if found == wanted and isinstance(expense.get("id"), int):
            return expense["id"]
    return None


def _share_key(shares: list[dict]) -> frozenset:
    return frozenset((s.get("user_id"), _decimal(s.get("paid_share")), _decimal(s.get("owed_share"))) for s in shares)


def _failure_reason(error: Exception) -> str:
    if isinstance(error, requests.RequestException):
        return f"couldn't reach Splitwise: {type(error).__name__}"
    return str(error)


def _interpret(
    text: str,
    metadata: Mapping[str, str],
    session: dict,
    settings: Settings,
    splitwise: SplitwiseService,
    asi: Reasoner,
    storage: Storage,
) -> str | None:
    group = _load_group(settings, splitwise)
    prompt = _expense_prompt(group, session, text, settings)
    session["transcript"] = [*session["transcript"], {"sender": metadata.get("sender", ""), "text": text}][
        -TRANSCRIPT_LIMIT:
    ]
    storage.set(SESSION_KEY, session)
    try:
        call = asi.choose_tool(prompt, EXPENSE_TOOLS)
    except (Asi1Error, requests.RequestException):
        return "ASI:One didn't answer, so I couldn't read that message. Try saying it again."

    if call is None:
        return None
    if call.name == "ask_user":
        return str(call.arguments.get("question") or "").strip() or None
    if call.name != "record_expense":
        return None

    draft = _draft_from(call.arguments, group, settings, metadata)
    session["drafts"].append(draft)
    storage.set(SESSION_KEY, session)
    return f"Draft: {_describe(draft, group)}. Group: {group.get('name')}."


def _draft_from(arguments: dict, group: dict, settings: Settings, metadata: Mapping[str, str]) -> dict:
    description = " ".join(str(arguments.get("description") or "").split())[:60] or "Expense"
    amount = _money(arguments.get("amount"))
    if amount is None:
        raise _Reply(f"How much was {description}? I need the amount before I can draft it.")

    payer_name = str(arguments.get("payer") or "me")
    names = [str(name) for name in arguments.get("participants") or [] if str(name).strip()]
    resolved = {name: _resolve(name, group, settings) for name in [payer_name, *names]}
    unknown = [name for name, match in resolved.items() if not match]
    ambiguous = {name: match for name, match in resolved.items() if len(match) > 1}
    if unknown:
        raise _Reply(
            f"I couldn't find {', '.join(unknown)} in {group.get('name')}, so I didn't draft {description}. "
            f"Who did you mean? Members: {', '.join(_full_name(m) for m in group.get('members') or [])}."
        )
    if ambiguous:
        choices = "; ".join(f"{name}: {' or '.join(_full_name(m) for m in match)}" for name, match in ambiguous.items())
        raise _Reply(f"Which person did you mean for {description}? {choices}.")

    payer_id = resolved[payer_name][0]["id"]
    user_ids = [payer_id]
    for name in names:
        user_id = resolved[name][0]["id"]
        if user_id not in user_ids:
            user_ids.append(user_id)
    if len(user_ids) < 2:
        raise _Reply(f"Who shared {description}? Name the people splitting it.")

    now = _now()
    draft = {
        "id": uuid.uuid4().hex,
        "status": "draft",
        "amount": _cents(amount),
        "description": description,
        "currency_code": CURRENCY_CODE,
        "shares": equal_shares(amount, payer_id, user_ids),
        "source_messages": [{"id": metadata.get("message_id", ""), "sender": metadata.get("sender", "")}],
        "created_at": now,
        "updated_at": now,
    }
    problems = validate_draft(draft)
    if problems:
        raise _Reply(f"I can't split {description} ${draft['amount']} that way: {'; '.join(problems)}.")
    return draft


def _resolve(name: str, group: dict, settings: Settings) -> list[dict]:
    """Members whose normalized first or full name equals `name`; the sender resolves to the demo user."""
    key = _normalize(name)
    members = group.get("members") or []
    if key in SELF_REFERENCES:
        return [m for m in members if m.get("id") == settings.demo_user_splitwise_id]
    return [m for m in members if key in (_normalize(m.get("first_name") or ""), _normalize(_full_name(m)))]


def equal_shares(amount: Decimal, payer_id: int, user_ids: list[int]) -> list[dict]:
    """Splits `amount` equally to the cent; the payer's owed share absorbs the rounding remainder."""
    base = (amount / len(user_ids)).quantize(CENT, rounding=ROUND_HALF_UP)
    payer_owed = amount - base * (len(user_ids) - 1)
    return [
        {
            "user_id": user_id,
            "paid_share": _cents(amount if user_id == payer_id else Decimal(0)),
            "owed_share": _cents(payer_owed if user_id == payer_id else base),
        }
        for user_id in user_ids
    ]


def validate_draft(draft: dict) -> list[str]:
    """Problems that would stop a Draft from becoming a balanced Splitwise Expense; empty when valid."""
    cost = Decimal(draft["amount"])
    shares = draft["shares"]
    problems = []
    if sum(Decimal(s["paid_share"]) for s in shares) != cost:
        problems.append("paid shares don't add up to the cost")
    if sum(Decimal(s["owed_share"]) for s in shares) != cost:
        problems.append("owed shares don't add up to the cost")
    if any(Decimal(s["paid_share"]) < 0 or Decimal(s["owed_share"]) < 0 for s in shares):
        problems.append("a share is negative")
    return problems


def draft_to_create_expense_payload(draft: dict, group_id: int) -> dict:
    payload = {
        "group_id": group_id,
        "cost": draft["amount"],
        "description": draft["description"],
        "currency_code": draft["currency_code"],
    }
    for field in ("details", "date"):
        if draft.get(field):
            payload[field] = draft[field]
    for i, share in enumerate(draft["shares"]):
        payload[f"users__{i}__user_id"] = share["user_id"]
        payload[f"users__{i}__paid_share"] = share["paid_share"]
        payload[f"users__{i}__owed_share"] = share["owed_share"]
    return payload


def _describe(draft: dict, group: dict) -> str:
    names = {m.get("id"): _full_name(m) for m in group.get("members") or []}
    shares = draft["shares"]
    payer = next((names.get(s["user_id"]) for s in shares if Decimal(s["paid_share"]) > 0), "someone")
    owed = sorted({Decimal(s["owed_share"]) for s in shares})
    split = "split equally" if owed[-1] - owed[0] < CENT * len(shares) else "split by shares"
    owed_text = ", ".join(f"{names.get(s['user_id'], 'unknown member')} ${s['owed_share']}" for s in shares)
    return f"{draft['description']} ${draft['amount']}, paid by {payer}, {split}: {owed_text}"


def _uncommitted(session: dict) -> list[dict]:
    return [draft for draft in session["drafts"] if draft["status"] == "draft"]


def _load_group(settings: Settings, splitwise: SplitwiseService) -> dict:
    try:
        group = splitwise.get_group(settings.splitwise_group_id)
    except SplitwiseError as error:
        raise _Reply(f"I couldn't read the Splitwise group just now ({error}). Check the Splitwise secrets and try again.")
    except requests.RequestException as error:
        raise _Reply(f"I couldn't reach Splitwise just now ({type(error).__name__}). Try again in a moment.")
    members = group.get("members") or []
    if not any(member.get("id") == settings.demo_user_splitwise_id for member in members):
        raise _Reply(
            f"The demo user is not a member of the Splitwise group \"{group.get('name')}\", so I can't record Expenses there."
        )
    return group


def _connection_reply(
    text: str, settings: Settings, splitwise: SplitwiseService, asi: Reasoner, preflight: bool = False
) -> str:
    group = _load_group(settings, splitwise)
    try:
        reply = asi.complete(_connection_prompt(group, text))
    except (Asi1Error, requests.RequestException):
        return f"I can see the Splitwise group \"{group.get('name')}\", but ASI:One didn't answer. Try again in a moment."
    if preflight:
        return f'PREFLIGHT OK group="{group.get("name")}" demo_user_member=yes asi1=yes'
    return reply


EXPENSE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "record_expense",
            "description": "Record one new shared Expense the user just described, once its amount is stated.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Short title, e.g. 'Pizza'."},
                    "amount": {"type": "string", "description": "Total cost exactly as stated, e.g. '30' or '12.50'."},
                    "payer": {"type": "string", "description": "'me' if the message sender paid, else the payer's name."},
                    "participants": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Names of everyone else sharing the cost besides the payer; use 'me' for the sender.",
                    },
                },
                "required": ["description", "amount", "payer", "participants"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ask_user",
            "description": "Ask one short question when an Expense is described but its amount or people are missing.",
            "parameters": {
                "type": "object",
                "properties": {"question": {"type": "string"}},
                "required": ["question"],
            },
        },
    },
]


def _expense_prompt(group: dict, session: dict, text: str, settings: Settings) -> list[dict]:
    members = ", ".join(_full_name(m) for m in group.get("members") or [])
    me = next((_full_name(m) for m in group.get("members") or [] if m.get("id") == settings.demo_user_splitwise_id), "")
    drafts = "; ".join(_describe(d, group) for d in _uncommitted(session)) or "none"
    transcript = "\n".join(entry["text"] for entry in session["transcript"]) or "(none)"
    system = (
        "You are the Shared-Money Agent listening to an iMessage DM during a Listening Session. "
        f"The message sender is {me}. Splitwise group \"{group.get('name')}\" members: {members}. "
        "When the new message describes a new shared Expense with a stated amount, call record_expense; "
        "the payer always shares the cost equally with the named participants. Never guess an amount. "
        "If an Expense is described but its amount or people are missing, call ask_user. "
        "If the message is not about a new shared Expense, call no tool and reply with an empty message.\n"
        f"Current Drafts: {drafts}\nEarlier messages in this session:\n{transcript}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": text}]


def _money(value: Any) -> Decimal | None:
    try:
        amount = Decimal(str(value).replace("$", "").replace(",", "").strip())
    except (InvalidOperation, ValueError):
        return None
    if not amount.is_finite() or amount <= 0:
        return None
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def _decimal(value: Any) -> Decimal | None:
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _cents(amount: Decimal) -> str:
    return str(amount.quantize(CENT, rounding=ROUND_HALF_UP))


def _normalize(name: str) -> str:
    return " ".join(name.casefold().lstrip("@").split())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _error_text(errors: Any) -> str:
    if isinstance(errors, dict):
        messages = [str(m) for value in errors.values() for m in (value if isinstance(value, list) else [value])]
        return "; ".join(messages) or "unknown error"
    return str(errors)


def _connection_prompt(group: dict, text: str) -> list[dict]:
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
