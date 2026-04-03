"use client";

export interface OrchestrationEvent {
  id: string;
  repair_job_id: string;
  event_type: string;
  action?: string;
  confidence_score?: number;
  pr_number?: number;
  created_at: string;
}

interface RepairHistoryProps {
  events: OrchestrationEvent[];
}

const eventIcons: Record<string, string> = {
  completion: "✅",
  failure: "❌",
  pr_created: "📝",
  pr_merged: "🔀",
  pr_approved: "👍",
  candidate_generated: "🎯",
};

const eventLabels: Record<string, string> = {
  completion: "Repair Completed",
  failure: "Repair Failed",
  pr_created: "PR Created",
  pr_merged: "PR Merged",
  pr_approved: "PR Approved",
  candidate_generated: "Candidate Generated",
};

const actionLabels: Record<string, string> = {
  fast_lane_ready_pr: "🚀 Fast Lane PR",
  ready_pr: "✅ Ready PR",
  draft_pr: "📝 Draft PR",
  candidate_only: "🔵 Candidate Only",
  do_not_repair: "🚫 Blocked",
};

export function RepairHistory({ events }: RepairHistoryProps) {
  if (events.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-600">No repair events yet</p>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900">
          Event Timeline ({events.length})
        </h3>
      </div>

      <div className="divide-y divide-gray-200">
        {events.map((event, idx) => {
          const time = new Date(event.created_at);
          const now = new Date();
          const diff = now.getTime() - time.getTime();
          const minutes = Math.floor(diff / 60000);
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);

          let timeStr = "";
          if (days > 0) timeStr = `${days}d ago`;
          else if (hours > 0) timeStr = `${hours}h ago`;
          else if (minutes > 0) timeStr = `${minutes}m ago`;
          else timeStr = "just now";

          return (
            <div key={event.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-3">
                {/* Timeline dot */}
                <div className="flex flex-col items-center pt-1">
                  <span className="text-lg">
                    {eventIcons[event.event_type] || "📌"}
                  </span>
                  {idx < events.length - 1 && (
                    <div className="w-0.5 h-8 bg-gray-200 my-2" />
                  )}
                </div>

                {/* Event details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-900">
                      {eventLabels[event.event_type] || event.event_type}
                    </p>
                    {event.action && (
                      <span className="inline-block px-2 py-0.5 text-xs rounded bg-indigo-100 text-indigo-800">
                        {actionLabels[event.action] || event.action}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                    <span className="font-mono">
                      {event.repair_job_id.slice(0, 8)}...
                    </span>
                    <span>{timeStr}</span>
                  </div>

                  {event.confidence_score !== undefined && (
                    <div className="mt-2 inline-block px-2 py-1 bg-gray-100 rounded text-xs">
                      <span className="text-gray-600">Confidence:</span>
                      <span className="ml-1 font-semibold text-gray-900">
                        {event.confidence_score.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  {event.pr_number && (
                    <div className="mt-2 inline-block px-2 py-1 bg-blue-100 rounded text-xs">
                      <span className="text-blue-700">
                        PR #{event.pr_number}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Timeline summary */}
      <div className="bg-gray-50 border-t border-gray-200 p-4 text-xs text-gray-600">
        <p>
          {events.length} event{events.length !== 1 ? "s" : ""} • Started{" "}
          {new Date(events[events.length - 1].created_at).toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
