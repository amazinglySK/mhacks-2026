"""Register the Photon Runtime's agent identity as an Agentverse mailbox agent.

One-time setup. The hosted Reasoning Agent resolves this address on the Almanac
to deliver replies into Photon's mailbox. Run with `bun run register`.
"""

import os
import sys

from uagents_core.config import AgentverseConfig
from uagents_core.contrib.protocols.chat import chat_protocol_spec
from uagents_core.identity import Identity
from uagents_core.protocol import ProtocolSpecification
from uagents_core.utils.registration import (
    AgentverseRegistrationRequest,
    AgentverseRequestError,
    RegistrationRequestCredentials,
    register_agent,
)


def main() -> int:
    missing = [n for n in ("PHOTON_AGENT_SEED", "AGENTVERSE_API_KEY") if not os.environ.get(n, "").strip()]
    if missing:
        print(f"Missing {', '.join(missing)} in photon/.env", file=sys.stderr)
        return 1

    seed = os.environ["PHOTON_AGENT_SEED"].strip()
    config = AgentverseConfig()
    request = AgentverseRegistrationRequest(
        name="Shared-Money Photon Runtime",
        endpoint=config.mailbox_endpoint,
        protocols=[ProtocolSpecification.compute_digest(chat_protocol_spec.manifest())],
        type="mailbox",
        description="iMessage bridge for the Shared-Money Agent demo.",
        active=True,
        track_interactions=False,
    )
    credentials = RegistrationRequestCredentials(
        agentverse_api_key=os.environ["AGENTVERSE_API_KEY"].strip(),
        agent_seed_phrase=seed,
    )
    try:
        register_agent(request, config, credentials)
    except AgentverseRequestError as error:
        print(f"Registration failed: {error}", file=sys.stderr)
        return 1

    address = Identity.from_seed(seed, 0).address
    print("Registered Photon mailbox agent.")
    print(f"Set PHOTON_SENDER_ADDRESS={address} in the Reasoning Agent's Agentverse secrets.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
