export type PhotonCredentials =
  | { kind: "project"; projectId: string; projectSecret: string }
  | { kind: "client"; client: { address: string; token: string; phone: string } };

export interface Config {
  photon: PhotonCredentials;
  demoDmId: string;
  photonAgentSeed: string;
  reasoningAgentAddress: string;
  agentverseUrl: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

type Env = Record<string, string | undefined>;

const PROJECT_VARS = ["PHOTON_PROJECT_ID", "PHOTON_PROJECT_SECRET"] as const;
const CLIENT_VARS = ["PHOTON_ADDRESS", "PHOTON_TOKEN", "PHOTON_PHONE"] as const;
const REQUIRED_VARS = ["DEMO_DM_ID", "PHOTON_AGENT_SEED", "REASONING_AGENT_ADDRESS"] as const;

/** Validates the local `.env`. Error messages name variables only, never their values. */
export function loadConfig(env: Env = process.env): Config {
  const read = (name: string) => env[name]?.trim() || undefined;
  const missingIn = (names: readonly string[]) => names.filter((name) => !read(name));

  const problems: string[] = [];
  const missing = missingIn(REQUIRED_VARS);
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);

  const missingProject = missingIn(PROJECT_VARS);
  const missingClient = missingIn(CLIENT_VARS);
  let photon: PhotonCredentials | undefined;
  if (missingProject.length === 0) {
    photon = { kind: "project", projectId: read("PHOTON_PROJECT_ID")!, projectSecret: read("PHOTON_PROJECT_SECRET")! };
  } else if (missingClient.length === 0) {
    photon = {
      kind: "client",
      client: { address: read("PHOTON_ADDRESS")!, token: read("PHOTON_TOKEN")!, phone: read("PHOTON_PHONE")! },
    };
  } else {
    problems.push(
      `Photon credentials incomplete: set ${PROJECT_VARS.join(" + ")} (missing ${missingProject.join(", ")}) ` +
        `or ${CLIENT_VARS.join(" + ")} (missing ${missingClient.join(", ")})`,
    );
  }

  if (problems.length || !photon) {
    throw new ConfigError(`Invalid Photon Runtime configuration: ${problems.join("; ")}`);
  }

  return {
    photon,
    demoDmId: read("DEMO_DM_ID")!,
    photonAgentSeed: read("PHOTON_AGENT_SEED")!,
    reasoningAgentAddress: read("REASONING_AGENT_ADDRESS")!,
    agentverseUrl: read("AGENTVERSE_URL") ?? "https://agentverse.ai",
  };
}
