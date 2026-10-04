/** The only fields of an iMessage that leave the presenter laptop. */
export interface DmMessage {
  messageId: string;
  sender: string;
  text: string;
}

/** Structural subset of a Spectrum `Message` that the allowlist reads. */
export interface InboundLike {
  id: string;
  platform: string;
  direction?: "inbound" | "outbound";
  space: { id: string };
  sender?: { id: string };
  content: { type: string; text?: string };
}

export type RejectReason = "other_platform" | "outbound" | "other_space" | "not_text";

export type Reduction = { ok: true; message: DmMessage } | { ok: false; reason: RejectReason };

export function reduceInbound(message: InboundLike, demoDmId: string): Reduction {
  if (message.platform !== "imessage") return { ok: false, reason: "other_platform" };
  if (message.direction === "outbound") return { ok: false, reason: "outbound" };
  if (message.space.id !== demoDmId) return { ok: false, reason: "other_space" };
  if (message.content.type !== "text" || typeof message.content.text !== "string") {
    return { ok: false, reason: "not_text" };
  }
  return {
    ok: true,
    message: { messageId: message.id, sender: message.sender?.id ?? "unknown", text: message.content.text },
  };
}
