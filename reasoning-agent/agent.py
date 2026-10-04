"""Hosted Reasoning Agent entrypoint. Paste into the Agentverse hosted editor next to shared_money.py."""

import asyncio

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    EndSessionContent,
    MetadataContent,
    TextContent,
    chat_protocol_spec,
)

from shared_money import Asi1Client, Settings, SettingsError, SplitwiseClient, respond_to_chat

agent = Agent()
chat = Protocol(spec=chat_protocol_spec)


@chat.on_message(ChatMessage)
async def on_chat_message(ctx: Context, sender: str, msg: ChatMessage):
    await ctx.send(sender, ChatAcknowledgement(acknowledged_msg_id=msg.msg_id))

    try:
        settings = Settings.from_env()
    except SettingsError as error:
        ctx.logger.error(str(error))
        return

    metadata: dict[str, str] = {}
    for part in msg.content:
        if isinstance(part, MetadataContent):
            metadata.update(part.metadata)

    reply = await asyncio.to_thread(
        respond_to_chat,
        sender=sender,
        text=msg.text(),
        metadata=metadata,
        settings=settings,
        splitwise=SplitwiseClient(settings.splitwise_api_key),
        asi=Asi1Client(settings.asi1_api_key, settings.asi1_base_url),
    )
    if reply is None:
        ctx.logger.info("chat_ignored")
        return

    content = [TextContent(text=reply)]
    if sender != settings.photon_sender_address:
        content.append(EndSessionContent())
    await ctx.send(sender, ChatMessage(content=content))
    ctx.logger.info("chat_replied")


@chat.on_message(ChatAcknowledgement)
async def on_chat_ack(ctx: Context, sender: str, msg: ChatAcknowledgement):
    pass


agent.include(chat, publish_manifest=True)
