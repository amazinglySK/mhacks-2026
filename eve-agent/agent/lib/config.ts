/** Live Photon + Splitwise settings. Error messages name variables only, never their values. */

export class ConfigError extends Error {
  override name = "ConfigError";
}

const PHOTON_VARS = [
  "ASI1_API_KEY",
  "IMESSAGE_PROJECT_ID",
  "IMESSAGE_PROJECT_SECRET",
  "IMESSAGE_WEBHOOK_SECRET",
  "DEMO_DM_ID",
] as const;

const SPLITWISE_VARS = ["SPLITWISE_API_KEY", "SPLITWISE_GROUP_ID", "DEMO_USER_SPLITWISE_ID"] as const;

export type AgentConfig = {
  demoDmId: string;
  projectId: string;
  projectSecret: string;
  webhookSecret: string;
};

/** True when this conversation is the configured DM (exact id or the same handle after `;-;`). */
export function allowConversation(conversationId: string, demoDmId: string): boolean {
  if (!conversationId || !demoDmId) return false;
  if (conversationId === demoDmId) return true;
  return conversationHandle(conversationId) === conversationHandle(demoDmId);
}

/** Validates required live settings. Fake Splitwise skips the Splitwise keys. */
export function requireConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  const names: string[] = [...PHOTON_VARS];
  if (env.SPLITWISE_CLIENT?.trim() !== "fake") names.push(...SPLITWISE_VARS);
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length > 0) throw new ConfigError(`Missing configuration: ${missing.join(", ")}.`);
  return {
    demoDmId: env.DEMO_DM_ID!.trim(),
    projectId: env.IMESSAGE_PROJECT_ID!.trim(),
    projectSecret: env.IMESSAGE_PROJECT_SECRET!.trim(),
    webhookSecret: env.IMESSAGE_WEBHOOK_SECRET!.trim(),
  };
}

function conversationHandle(id: string): string {
  const parts = id.split(";-;");
  return (parts.at(-1) ?? id).trim();
}
