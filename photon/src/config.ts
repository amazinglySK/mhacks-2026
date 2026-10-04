export type PhotonCredentials =
  | { kind: "project"; projectId: string; projectSecret: string }
  | { kind: "client"; client: { address: string; token: string; phone: string } };

export interface Config {
  photon: PhotonCredentials;
  demoDmId: string;
  photonAgentSeed: string;
  reasoningAgentAddress: string;
}

export class ConfigError extends Error {
  override name = "ConfigError";
}

type Env = Record<string, string | undefined>;

const PROJECT_VARS = ["PHOTON_PROJECT_ID", "PHOTON_PROJECT_SECRET"] as const;
const CLIENT_VARS = ["PHOTON_ADDRESS", "PHOTON_TOKEN", "PHOTON_PHONE"] as const;
const REQUIRED_VARS = ["DEMO_DM_ID", "PHOTON_AGENT_SEED", "REASONING_AGENT_ADDRESS"] as const;

const reader = (env: Env) => (name: string) => env[name]?.trim() || undefined;

function photonCredentials(env: Env): { photon?: PhotonCredentials; problem?: string } {
  const read = reader(env);
  const missingIn = (names: readonly string[]) => names.filter((name) => !read(name));
  const missingProject = missingIn(PROJECT_VARS);
  const missingClient = missingIn(CLIENT_VARS);
  if (missingProject.length === 0) {
    return { photon: { kind: "project", projectId: read("PHOTON_PROJECT_ID")!, projectSecret: read("PHOTON_PROJECT_SECRET")! } };
  }
  if (missingClient.length === 0) {
    return {
      photon: {
        kind: "client",
        client: { address: read("PHOTON_ADDRESS")!, token: read("PHOTON_TOKEN")!, phone: read("PHOTON_PHONE")! },
      },
    };
  }
  return {
    problem:
      `Photon credentials incomplete: set ${PROJECT_VARS.join(" + ")} (missing ${missingProject.join(", ")}) ` +
      `or ${CLIENT_VARS.join(" + ")} (missing ${missingClient.join(", ")})`,
  };
}

/** Photon credentials alone, for setup tools that run before the rest of `.env` is filled. */
export function loadPhotonCredentials(env: Env = process.env): PhotonCredentials {
  const { photon, problem } = photonCredentials(env);
  if (!photon) throw new ConfigError(`Invalid Photon Runtime configuration: ${problem}`);
  return photon;
}

/** Validates the local `.env`. Error messages name variables only, never their values. */
export function loadConfig(env: Env = process.env): Config {
  const read = reader(env);
  const problems: string[] = [];
  const missing = REQUIRED_VARS.filter((name) => !read(name));
  if (missing.length) problems.push(`missing ${missing.join(", ")}`);

  const { photon, problem } = photonCredentials(env);
  if (problem) problems.push(problem);

  if (problems.length || !photon) {
    throw new ConfigError(`Invalid Photon Runtime configuration: ${problems.join("; ")}`);
  }

  return {
    photon,
    demoDmId: read("DEMO_DM_ID")!,
    photonAgentSeed: read("PHOTON_AGENT_SEED")!,
    reasoningAgentAddress: read("REASONING_AGENT_ADDRESS")!,
  };
}

/** Secrets and real identifiers that must never appear in log output. */
export function sensitiveValues(config: Config): string[] {
  const values = [config.demoDmId, config.demoDmId.split(";").at(-1) ?? "", config.photonAgentSeed];
  if (config.photon.kind === "project") values.push(config.photon.projectSecret);
  else values.push(config.photon.client.token, config.photon.client.phone);
  return values;
}
