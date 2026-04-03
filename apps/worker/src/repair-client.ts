/**
 * HTTP client for calling the Penny Repair Service.
 * Handles repair job submission, status polling, and result retrieval.
 */

import { randomUUID } from "node:crypto";

export interface RepairJobRequest {
  run_id: string;
  finding_id: string;
  project_id: string;
  file_path: string;
  finding_title: string;
  finding_type?: string;
  finding_severity?: string;
  description?: string;
  code_context?: string;
  repair_config?: {
    beam_width?: number;
    max_depth?: number;
    timeout_seconds?: number;
    validation_commands?: string[];
    language?: string;
  };
}

export interface RepairJobResponse {
  repair_job_id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked";
  created_at: string;
  estimated_completion_ms: number;
}

export interface RepairJobStatus {
  repair_job_id: string;
  finding_id: string;
  project_id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "blocked";
  confidence_score?: number;
  confidence_breakdown?: {
    validation: number;
    locality: number;
    risk: number;
    uncertainty_penalty: number;
  };
  action?: string;
  progress?: Record<string, unknown>;
  best_candidate_id?: string;
  best_score?: number;
  candidates: Array<Record<string, unknown>>;
  pr_id?: string;
  pr_number?: number;
  pr_url?: string;
  error_message?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export class RepairServiceClient {
  private serviceUrl: string;
  private serviceSecret: string;
  private maxRetries: number = 3;
  private retryDelayMs: number = 1000;

  constructor(serviceUrl?: string, serviceSecret?: string) {
    this.serviceUrl = serviceUrl || process.env.REPAIR_SERVICE_URL || "http://localhost:3001";
    this.serviceSecret = serviceSecret || process.env.REPAIR_SERVICE_SECRET || "";

    if (!this.serviceSecret) {
      console.warn("[repair-client] REPAIR_SERVICE_SECRET not configured");
    }
  }

  /**
   * Submit a repair job.
   * Returns the job ID for later polling.
   */
  async submitJob(request: RepairJobRequest): Promise<RepairJobResponse> {
    const url = `${this.serviceUrl}/jobs`;

    const response = await this._fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.serviceSecret}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to submit repair job: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as RepairJobResponse;
  }

  /**
   * Get repair job status.
   */
  async getJobStatus(jobId: string): Promise<RepairJobStatus> {
    const url = `${this.serviceUrl}/jobs/${jobId}`;

    const response = await this._fetchWithRetry(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.serviceSecret}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repair job ${jobId} not found`);
      }
      throw new Error(
        `Failed to fetch job status: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as RepairJobStatus;
  }

  /**
   * Wait for repair job to complete.
   * Polls status until completion or timeout.
   */
  async waitForCompletion(
    jobId: string,
    timeoutMs: number = 600000 // 10 minutes
  ): Promise<RepairJobStatus> {
    const startTime = Date.now();
    const pollIntervalMs = 2000; // Poll every 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getJobStatus(jobId);

        // Check if completed
        if (status.status === "completed" || status.status === "failed") {
          return status;
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      } catch (error) {
        // If job not found, break early
        if (error instanceof Error && error.message.includes("not found")) {
          throw error;
        }

        // Otherwise retry
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      }
    }

    throw new Error(`Repair job ${jobId} did not complete within ${timeoutMs}ms`);
  }

  /**
   * Submit job and wait for completion (non-blocking from caller perspective).
   * Used for integration with audit worker.
   */
  async submitAndPoll(
    request: RepairJobRequest,
    timeoutMs?: number
  ): Promise<RepairJobStatus> {
    const jobResponse = await this.submitJob(request);
    return this.waitForCompletion(jobResponse.repair_job_id, timeoutMs);
  }

  /**
   * Check service health.
   */
  async health(): Promise<Record<string, unknown>> {
    const url = `${this.serviceUrl}/health`;

    try {
      const response = await this._fetchWithRetry(url, {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      throw new Error(
        `Repair service health check failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Retry logic for network failures.
   */
  private async _fetchWithRetry(
    url: string,
    options: RequestInit
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          // Don't retry on client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            return response;
          }

          return response;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Wait before retrying
        if (attempt < this.maxRetries - 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelayMs * Math.pow(2, attempt))
          );
        }
      }
    }

    throw lastError || new Error("Fetch failed after retries");
  }
}

export function getRepairClient(): RepairServiceClient {
  return new RepairServiceClient();
}
