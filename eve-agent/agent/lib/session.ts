import { defineState } from "eve/context";
import { NO_SESSION } from "./listening";
import type { ListeningSession } from "./listening";

export const session = defineState("shared-money.session", (): ListeningSession => structuredClone(NO_SESSION));
