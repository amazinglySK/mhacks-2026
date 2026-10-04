import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  async setup() {
    // Env files can't override a variable set before `eve eval` starts, so `npm run eval` sets it there.
    if (process.env.SPLITWISE_CLIENT !== "fake") {
      throw new Error('Evals must use the fake Splitwise client; run them with `npm run eval`.');
    }
  },
});
