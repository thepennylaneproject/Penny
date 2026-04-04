/**
 * verify-routing.ts — Routing sanity check for penny worker
 *
 * Run with: npx tsx worker/src/scripts/verify-routing.ts
 *
 * Prints the resolved model chain for each strategy and audit kind based on
 * which providers are actually configured in your environment.
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "path";

// Load keys from .env.local (then .env as fallback) in the worker directory
const workerRoot = resolve(new URL(".", import.meta.url).pathname, "../../..");
loadDotenv({ path: resolve(workerRoot, ".env.local"), override: false });
loadDotenv({ path: resolve(workerRoot, ".env"),       override: false });

import {
  experimentalProvidersAllowed,
  getModelMetadata,
  getRegistry,
  premiumAllowedByDefault,
  resolveMaxEstimatedCostUsd,
} from "../providers/registry.js";
import { resolveModelChain } from "../llm.js";

function main() {
  const registry = getRegistry();

  console.log("\n=== penny Routing Verification ===\n");

  // Show chain for each strategy × audit kind combination
  const strategies = ["precision", "balanced", "aggressive", "economy"];
  const auditKinds = [
    { label: "security (high-stakes)", kind: "security" },
    { label: "logic   (high-stakes)", kind: "logic" },
    { label: "visual  (large-context)", kind: "visual" },
    { label: "ux      (standard)",     kind: "ux" },
    { label: "synthesize (synthesis)",  kind: "synthesize" },
    { label: "full    (default)",       kind: undefined },
  ];

  for (const strategy of strategies) {
    process.env.penny_ROUTING_STRATEGY = strategy;
    console.log(`\nStrategy: ${strategy.toUpperCase()}`);
    console.log("─".repeat(60));

    for (const { label, kind } of auditKinds) {
      const chain = resolveModelChain(kind);
      const resolved = chain.map((ref) => {
        const [provName] = ref.split(":");
        const ok = registry.getProvider(provName)?.isConfigured() ?? false;
        const meta = getModelMetadata(ref);
        const decorated = `${ref}[${meta.tier}${meta.experimental ? ",exp" : ""}]`;
        return ok ? decorated : `(${decorated})`;
      });
      console.log(`  ${label.padEnd(28)} → ${resolved.join(" → ")}`);
    }
  }

  // Provider status table
  console.log("\n\n=== Provider Status ===\n");
  const allProviders = ["anthropic", "deepseek", "openai", "gemini", "aimlapi", "huggingface"];
  for (const name of allProviders) {
    const p = registry.getProvider(name);
    if (!p) { console.log(`  ${name.padEnd(14)}: not registered`); continue; }
    const ok = p.isConfigured();
    const models = Object.keys(p.models).join(", ");
    console.log(`  ${name.padEnd(14)}: ${ok ? "✓ configured" : `✗ not configured — ${p.configurationError()}`}   [${models}]`);
  }

  // Env vars (keys redacted)
  console.log("\n=== Environment ===\n");
  const vars = [
    "ANTHROPIC_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY",
    "GEMINI_API_KEY", "AIMLAPI_API_KEY", "HF_TOKEN",
    "penny_ROUTING_STRATEGY", "penny_AUDIT_MODEL",
    "penny_ALLOW_PREMIUM_MODELS", "penny_ALLOW_PREMIUM_SYNTHESIS",
    "penny_ENABLE_EXPERIMENTAL_PROVIDERS", "penny_MAX_ESTIMATED_LLM_CALL_USD",
  ];
  for (const v of vars) {
    const val = process.env[v];
    const display = val
      ? (v.includes("KEY") || v.includes("TOKEN") ? `set (${val.slice(0, 8)}...)` : val)
      : "not set";
    console.log(`  ${v.padEnd(30)}: ${display}`);
  }

  console.log("\n=== Guardrails ===\n");
  console.log(`  premium allowed by default        : ${premiumAllowedByDefault()}`);
  console.log(`  experimental providers enabled   : ${experimentalProvidersAllowed()}`);
  console.log(`  max estimated call cost usd      : ${resolveMaxEstimatedCostUsd().toFixed(4)}`);

  console.log("\n=== Done ===\n");
}

main();
