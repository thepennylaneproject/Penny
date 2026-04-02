"use client";

import { useState, useEffect, useCallback } from "react";
import { OrchestrationPanel } from "@/components/OrchestrationPanel";
import { apiFetch } from "@/lib/api-fetch";
import type { RoutingConfig } from "@/lib/routing-config";
import { UI_COPY } from "@/lib/ui-copy";

const ENGINE_OPS_STORAGE_KEY = "penny_engine_operations_open";

interface EngineData {
  routing: RoutingConfig;
}

const MODEL_TIER: Record<string, string> = {
  "hf-nano":          "nano",
  "aimlapi-nano":     "nano",
  "aimlapi-cheap":    "cheap",
  "aimlapi-mid":      "mid",
  "aimlapi-expensive":"expensive",
  "gpt-mini":         "mini",
  "gpt-balanced":     "balanced",
  "gpt-high":         "high",
  "gpt-reasoning":    "reasoning",
  "claude-haiku":     "haiku",
  "claude-sonnet":    "sonnet",
  "claude-opus":      "opus",
  "gemini-flash":     "flash",
  "gemini-flash-lite":"flash-lite",
  "gemini-pro":       "pro",
};

const TIER_COLOR: Record<string, string> = {
  nano:       "var(--ink-text-4)",
  cheap:      "var(--ink-text-3)",
  "flash-lite":"var(--ink-text-3)",
  flash:      "var(--ink-text-3)",
  mini:       "var(--ink-text-3)",
  mid:        "var(--ink-text-2)",
  balanced:   "var(--ink-text-2)",
  haiku:      "var(--ink-text-2)",
  expensive:  "var(--ink-amber)",
  high:       "var(--ink-amber)",
  sonnet:     "var(--ink-amber)",
  pro:        "var(--ink-amber)",
  reasoning:  "var(--ink-red)",
  opus:       "var(--ink-red)",
};

const TASK_LABELS: Record<string, string> = {
  generate_pseudo_code_fixes: "Code fix generation",
  apply_code_patches: "Patch application",
  run_tests: "Test execution",
  validate_output: "Output validation",
  analyze_findings: "Finding analysis",
  generate_summary: "Summary generation",
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize:      "9px",
        fontFamily:    "var(--font-mono)",
        fontWeight:    500,
        color:         "var(--ink-text-4)",
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        marginBottom:  "0.75rem",
      }}
    >
      {children}
    </div>
  );
}

function inferTier(alias: string) {
  const lower = alias.toLowerCase();
  if (MODEL_TIER[lower]) return MODEL_TIER[lower];
  if (lower.includes("nano") || lower.includes("8b") || lower.includes("zephyr")) return "nano";
  if (lower.includes("cheap") || lower.includes("7b") || lower.includes("mistral") || lower.includes("flash-lite")) return "cheap";
  if (lower.includes("mid") || lower.includes("mixtral")) return "mid";
  if (lower.includes("mini")) return "mini";
  if (lower.includes("flash")) return "flash";
  if (lower.includes("sonnet")) return "sonnet";
  if (lower.includes("haiku")) return "haiku";
  if (lower.includes("pro")) return "pro";
  if (lower.includes("opus")) return "opus";
  if (lower.includes("gpt-4o")) return "high";
  return "mid";
}

function ModelChip({ alias }: { alias: string }) {
  const tier  = inferTier(alias);
  const color = TIER_COLOR[tier] ?? "var(--ink-text-3)";
  return (
    <span
      style={{
        fontSize:      "10px",
        fontFamily:    "var(--font-mono)",
        color,
        background:    "var(--ink-bg-sunken)",
        border:        "0.5px solid var(--ink-border-faint)",
        borderRadius:  "var(--radius-sm)",
        padding:       "1px 6px",
        whiteSpace:    "nowrap",
      }}
    >
      {alias}
    </span>
  );
}

export function EngineView() {
  const [data,              setData]              = useState<EngineData | null>(null);
  const [loading,           setLoading]           = useState(true);
  const [routingError,      setRoutingError]      = useState<string | null>(null);
  const [fullRoutingError,  setFullRoutingError]  = useState<string | null>(null);
  const [expandError,       setExpandError]       = useState(false);
  const [operationsOpen,    setOperationsOpen]    = useState(false);

  useEffect(() => {
    try {
      setOperationsOpen(sessionStorage.getItem(ENGINE_OPS_STORAGE_KEY) === "1");
    } catch {
      setOperationsOpen(false);
    }
  }, []);

  const setOperationsOpenPersist = (open: boolean) => {
    setOperationsOpen(open);
    try {
      if (open) sessionStorage.setItem(ENGINE_OPS_STORAGE_KEY, "1");
      else sessionStorage.removeItem(ENGINE_OPS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const fetchAll = useCallback(async () => {
    setRoutingError(null);
    try {
      const routingRes = await apiFetch("/api/engine/routing");
      if (!routingRes.ok) {
        const errText = await routingRes.text();
        setFullRoutingError(errText);
        setRoutingError(`Could not load routing (${routingRes.status})`);
      }
      const routing = routingRes.ok ? await routingRes.json() : {};

      setData({
        routing,
      });
    } catch (error) {
      setRoutingError(error instanceof Error ? error.message : "Could not load routing");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>
        loading…
      </span>
    );
  }

  const routes: RoutingConfig["routes"] = data?.routing?.routes ?? {};
  const rules: RoutingConfig["rules"] = data?.routing?.rules ?? {
    max_cost_per_task: 0,
    confidence_threshold: 0,
    auto_escalate: false,
    max_retries: 0,
  };
  const catalog: RoutingConfig["catalog"] | null = data?.routing?.catalog ?? null;
  const strategy   = data?.routing?.strategy ?? "balanced";
  const sources    = data?.routing?.sources ?? { env: false, file: false };
  const routingDegraded = Boolean(routingError);

  return (
    <div>
      {routingError ? (
        <div
          role="alert"
          style={{
            marginBottom: "1.25rem",
            padding: "0.65rem 0.85rem",
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            lineHeight: 1.45,
            color: "var(--ink-amber)",
            background: "var(--ink-bg-sunken)",
            border: "0.5px solid var(--ink-border-faint)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div style={{ marginBottom: "0.5rem", fontWeight: 500, color: "var(--ink-text-2)" }}>
            {UI_COPY.engineRoutingDegradedTitle}
          </div>
          <div style={{ color: "var(--ink-text-3)", marginBottom: "0.5rem" }}>
            {UI_COPY.engineRoutingDegradedBody}
          </div>
          <div style={{ color: "var(--ink-text-4)", marginBottom: "0.5rem" }}>{routingError}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
            <button type="button" onClick={() => void fetchAll()} style={{ fontSize: "11px", padding: "3px 10px" }}>
              Retry
            </button>
            {fullRoutingError ? (
              <button
                type="button"
                onClick={() => setExpandError(true)}
                style={{
                  fontSize: "11px",
                  border: "none",
                  background: "none",
                  color: "inherit",
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Show details in table
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        style={{
          opacity: routingDegraded ? 0.55 : 1,
          transition: "opacity 0.15s ease",
        }}
      >
      {/* Header */}
      <div style={{ marginBottom: "1.75rem" }}>
        <div
          style={{
            fontSize:      "9px",
            fontFamily:    "var(--font-mono)",
            fontWeight:    500,
            color:         "var(--ink-text-4)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom:  "0.25rem",
          }}
        >
          Engine
        </div>
        <h2 style={{ fontSize: "17px", fontWeight: 500, margin: 0, color: "var(--ink-text)" }}>
          Model routing
        </h2>
      </div>

      {/* Routing table */}
      <div style={{ marginBottom: "2.5rem" }}>
        <SectionLabel>Task → model</SectionLabel>
        <div
          style={{
            display:       "flex",
            flexDirection: "column",
            gap:           "0",
            borderTop:     "0.5px solid var(--ink-border-faint)",
          }}
        >
          {Object.entries(routes).map(([task, route]) => (
            <div
              key={task}
              style={{
                display:       "grid",
                gridTemplateColumns: "1fr auto auto auto",
                alignItems:    "center",
                gap:           "0.75rem",
                padding:       "0.625rem 0",
                borderBottom:  "0.5px solid var(--ink-border-faint)",
              }}
            >
              <span
                style={{
                  fontSize:   "12px",
                  fontFamily: "var(--font-mono)",
                  color:      "var(--ink-text-2)",
                }}
              >
                {TASK_LABELS[task] ?? task.replace(/_/g, " ")}
              </span>
              <span
                style={{
                  fontSize:   "9px",
                  fontFamily: "var(--font-mono)",
                  color:      "var(--ink-text-4)",
                }}
              >
                ({task})
              </span>
              <ModelChip alias={route.primary} />
              <span
                style={{
                  fontSize:   "10px",
                  fontFamily: "var(--font-mono)",
                  color:      "var(--ink-text-4)",
                }}
              >
                ↳ {route.fallback}
              </span>
            </div>
          ))}
          {Object.keys(routes).length === 0 && (
            <div
              style={{
                fontSize:   "12px",
                fontFamily: "var(--font-mono)",
                color:      routingError ? "var(--color-text-danger)" : "var(--ink-text-4)",
                padding:    "0.75rem 0",
              }}
            >
              {routingError ? (
                <>
                  <div>
                    {expandError && fullRoutingError ? fullRoutingError : routingError}
                    {fullRoutingError && fullRoutingError.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setExpandError(!expandError)}
                        style={{ marginLeft: "0.5rem", fontSize: "11px", textDecoration: "underline", border: "none", background: "none", color: "inherit", cursor: "pointer" }}
                      >
                        {expandError ? "hide" : "show details"}
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={() => fetchAll()} style={{ marginLeft: "0", marginTop: "0.5rem", fontSize: "11px" }}>
                    Retry
                  </button>
                </>
              ) : (
                "no routing config found"
              )}
            </div>
          )}
        </div>
      </div>

      {/* Strategy + catalog */}
      <div style={{ marginBottom: "2.5rem" }}>
        <SectionLabel>Routing strategy</SectionLabel>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <div>
            <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
              strategy
            </div>
            <div style={{ fontSize: "18px", fontWeight: 300, color: "var(--ink-text)" }}>
              {strategy}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
              source
            </div>
            <div style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--ink-text-2)" }}>
              {sources.file ? "env + routing_config.json" : "env defaults"}
            </div>
          </div>
        </div>
        {catalog && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            {Object.entries(catalog).map(([provider, models]) => (
              <div key={provider} style={{ border: "0.5px solid var(--ink-border-faint)", borderRadius: "var(--radius-md)", padding: "0.75rem" }}>
                <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  {provider}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {Object.entries(models as Record<string, string>).map(([key, value]) => (
                    <div key={key} style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                      <span style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)" }}>{key}</span>
                      <ModelChip alias={value} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cost rules */}
      {Object.keys(rules).length > 0 && (
        <div style={{ marginBottom: "2.5rem" }}>
          <SectionLabel>Rules</SectionLabel>
          <div
            style={{
              display:       "flex",
              flexWrap:      "wrap",
              gap:           "1.5rem",
            }}
          >
            {rules.max_cost_per_task != null && (
              <div>
                <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                  max cost/task
                </div>
                <div style={{ fontSize: "18px", fontWeight: 300, color: "var(--ink-text)", fontVariantNumeric: "tabular-nums" }}>
                  ${rules.max_cost_per_task.toFixed(2)}
                </div>
              </div>
            )}
            {rules.confidence_threshold != null && (
              <div>
                <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                  confidence threshold
                </div>
                <div style={{ fontSize: "18px", fontWeight: 300, color: "var(--ink-text)", fontVariantNumeric: "tabular-nums" }}>
                  {(rules.confidence_threshold * 100).toFixed(0)}%
                </div>
              </div>
            )}
            {rules.max_retries != null && (
              <div>
                <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                  max retries
                </div>
                <div style={{ fontSize: "18px", fontWeight: 300, color: "var(--ink-text)", fontVariantNumeric: "tabular-nums" }}>
                  {rules.max_retries}
                </div>
              </div>
            )}

            {rules.auto_escalate != null && (
              <div>
                <div style={{ fontSize: "9px", fontFamily: "var(--font-mono)", color: "var(--ink-text-4)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "0.2rem" }}>
                  auto escalate
                </div>
                <div style={{ fontSize: "18px", fontWeight: 300, color: "var(--ink-text)", fontVariantNumeric: "tabular-nums" }}>
                  {rules.auto_escalate ? "on" : "off"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      <div style={{ marginTop: "3rem" }}>
        <button
          type="button"
          onClick={() => setOperationsOpenPersist(!operationsOpen)}
          style={{
            fontSize:     "11px",
            fontFamily:   "var(--font-mono)",
            border:       "none",
            background:   "transparent",
            padding:      0,
            color:        "var(--ink-text-3)",
            cursor:       "pointer",
            textDecoration: "underline",
          }}
        >
          {operationsOpen ? "Hide worker operations" : "Show worker operations"}
        </button>
        {operationsOpen ? (
          <div style={{ marginTop: "1.25rem" }}>
            <OrchestrationPanel />
          </div>
        ) : null}
      </div>
    </div>
  );
}
