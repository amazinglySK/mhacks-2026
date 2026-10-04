import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { defineAgent } from "eve";

const asi1 = createOpenAICompatible({
  name: "asi1",
  baseURL: process.env.ASI1_BASE_URL ?? "https://api.asi1.ai/v1",
  apiKey: process.env.ASI1_API_KEY,
});

export default defineAgent({
  model: asi1.chatModel("asi1"),
  // Custom providers aren't in the AI Gateway catalog, so eve can't look this up.
  modelContextWindowTokens: 64_000,
  defaultTools: false,
});
