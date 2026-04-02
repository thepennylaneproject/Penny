/**
 * Penny v3.0 Worker Observability
 * Handles Sentry integration, Datadog-compatible JSON logging, and loop detection
 */

import * as Sentry from '@sentry/node';

// Initialize Sentry for error correlation
function initSentry() {
  const dsn = process.env.PENNY_SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV || 'production',
      tracesSampleRate: 1.0,
    });
  }
}

initSentry();

export interface AgentMetric {
  run_id: string;
  project_id: string;
  agent_name: string;
  model: string;
  latency_ms: number;
  cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  status: 'success' | 'fallback_triggered' | 'error';
  error_message?: string;
}

export class PennyObservability {
  // In-memory store for fast loop detection (use Redis in multi-node production)
  private static actionHistory: Map<string, number[]> = new Map();

  /**
   * Emits a structured JSON log optimized for Datadog ingestion
   * and tracks performance metrics.
   */
  static logExecution(metric: AgentMetric) {
    const logPayload = {
      timestamp: new Date().toISOString(),
      event_type: 'agent_execution',
      ...metric,
    };

    // 1. Structured Logging (Standard output captured by Datadog)
    if (metric.status === 'error') {
      console.error(JSON.stringify(logPayload));
    } else {
      console.log(JSON.stringify(logPayload));
    }

    // 2. Loop Detection (Preventing runaway agent spend)
    this.detectLoops(metric.run_id, metric.agent_name);
  }

  /**
   * Identifies repeated actions or token spend without progress.
   * Flags if an agent runs 4+ times on the same run within 5 minutes.
   */
  private static detectLoops(runId: string, agentName: string) {
    const loopKey = `${runId}:${agentName}`;
    const now = Date.now();
    const history = this.actionHistory.get(loopKey) || [];

    // Keep only events from the last 5 minutes
    const recentHistory = history.filter((time) => now - time < 5 * 60 * 1000);
    recentHistory.push(now);

    // If an agent runs more than 4 times on the same run_id in 5 minutes, it's thrashing
    if (recentHistory.length >= 4) {
      const alertMsg = `[Loop Detected] Agent '${agentName}' is thrashing on run '${runId}'.`;

      // Alert Sentry immediately
      Sentry.captureMessage(alertMsg, {
        level: 'warning',
        tags: { agent: agentName, run_id: runId },
      });

      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          event_type: 'loop_detected',
          agent_name: agentName,
          run_id: runId,
          attempts_in_window: recentHistory.length,
        })
      );
    }

    this.actionHistory.set(loopKey, recentHistory);
  }

  /**
   * Captures hard crashes and sandbox escapes
   */
  static captureError(error: Error, context: Record<string, unknown>) {
    Sentry.captureException(error, { extra: context });
    console.error(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        event_type: 'system_error',
        error: error.message,
        stack: error.stack,
        context,
      })
    );
  }
}
