"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Violation {
  id: string;
  constraintId: string;
  projectId: string;
  severity: "critical" | "high" | "medium" | "low";
  currentState: string;
  expectedState: string;
  remediation: string;
  confidence: number;
  complexity: string;
  estimatedFixTime: string;
  autoFixAvailable: boolean;
}

interface PageProps {
  params: {
    id: string;
  };
}

export default function VerifyViolationPage({ params }: PageProps) {
  const { id } = params;
  const [violation, setViolation] = useState<Violation | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verification, setVerification] = useState({
    notes: "",
    evidence: "",
    suggestedFix: ""
  });

  useEffect(() => {
    loadViolation();
  }, [id]);

  const loadViolation = async () => {
    try {
      const response = await fetch(`/api/violations/verify?id=${id}`);
      const data = await response.json();
      setViolation(data.violation);
    } catch (error) {
      console.error("Failed to load violation:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (isVerified: boolean) => {
    setVerifying(true);
    try {
      const response = await fetch("/api/violations/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          violationId: id,
          verified: isVerified,
          verification: {
            ...verification,
            reviewedBy: "current-user" // In real app, get from auth
          }
        })
      });

      if (response.ok) {
        setVerified(true);
        alert(`Violation ${isVerified ? "verified" : "marked for review"}`);
        // Redirect back
        setTimeout(() => window.history.back(), 1500);
      }
    } catch (error) {
      console.error("Verification failed:", error);
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading violation...</div>;
  }

  if (!violation) {
    return <div className="flex items-center justify-center p-8">Violation not found</div>;
  }

  const severityColors = {
    critical: "bg-red-100 text-red-800 border-red-400",
    high: "bg-orange-100 text-orange-800 border-orange-400",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-400",
    low: "bg-green-100 text-green-800 border-green-400"
  };

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      <div className="flex justify-between items-center">
        <div>
          <Link href="/violations" className="text-blue-600 hover:underline">
            ← Back to Violations
          </Link>
          <h1 className="text-3xl font-bold mt-2">Manual Verification</h1>
        </div>
        <div
          className={`px-4 py-2 rounded font-semibold ${severityColors[violation.severity]}`}
        >
          {violation.severity.toUpperCase()}
        </div>
      </div>

      {verified && (
        <div className="p-4 bg-green-100 border border-green-400 text-green-700 rounded">
          ✓ Verification submitted successfully
        </div>
      )}

      {/* Violation Details */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Violation Details</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <p className="text-sm text-gray-600 mb-1">Constraint</p>
            <p className="font-mono font-bold text-lg">{violation.constraintId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Project</p>
            <p className="font-bold text-lg">{violation.projectId}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Complexity</p>
            <p className="font-bold text-lg">{violation.complexity}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-1">Estimated Fix Time</p>
            <p className="font-bold text-lg">{violation.estimatedFixTime}</p>
          </div>
        </div>

        <div className="border-t pt-6">
          <p className="text-sm text-gray-600 mb-2">Current State</p>
          <div className="p-3 bg-red-50 border border-red-200 rounded mb-4">
            <code className="text-sm">{violation.currentState}</code>
          </div>

          <p className="text-sm text-gray-600 mb-2">Expected State</p>
          <div className="p-3 bg-green-50 border border-green-200 rounded mb-4">
            <code className="text-sm">{violation.expectedState}</code>
          </div>

          <p className="text-sm text-gray-600 mb-2">Remediation</p>
          <p className="p-3 bg-blue-50 border border-blue-200 rounded">
            {violation.remediation}
          </p>
        </div>
      </div>

      {/* Verification Form */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Your Verification</h2>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Notes</label>
            <textarea
              value={verification.notes}
              onChange={e => setVerification({ ...verification, notes: e.target.value })}
              placeholder="Your observations and findings..."
              rows={3}
              className="w-full px-3 py-2 border rounded"
            />
            <p className="text-xs text-gray-500 mt-1">
              Document your review findings
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Evidence</label>
            <textarea
              value={verification.evidence}
              onChange={e => setVerification({ ...verification, evidence: e.target.value })}
              placeholder="Links to code, commits, documentation, etc..."
              rows={2}
              className="w-full px-3 py-2 border rounded"
            />
            <p className="text-xs text-gray-500 mt-1">
              Provide evidence supporting your verification
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Suggested Fix (Optional)</label>
            <textarea
              value={verification.suggestedFix}
              onChange={e => setVerification({ ...verification, suggestedFix: e.target.value })}
              placeholder="How should this violation be fixed?"
              rows={3}
              className="w-full px-3 py-2 border rounded"
            />
            <p className="text-xs text-gray-500 mt-1">
              If you have a proposed fix, describe it here
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 p-4 rounded mb-6">
          <p className="text-sm">
            <strong>Confidence Score:</strong> {(violation.confidence * 100).toFixed(0)}%
          </p>
          <p className="text-xs text-gray-600 mt-2">
            {violation.confidence < 0.7
              ? "⚠️ Low confidence - Your manual review is important"
              : "✓ High confidence - Auto-fix may be available"}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleSubmit(true)}
            disabled={verifying || !verification.notes}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
          >
            {verifying ? "Submitting..." : "Verify as Valid"}
          </button>
          <button
            onClick={() => handleSubmit(false)}
            disabled={verifying || !verification.notes}
            className="flex-1 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:bg-gray-400"
          >
            {verifying ? "Submitting..." : "Needs Review"}
          </button>
          <button
            onClick={() => window.history.back()}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
        <h3 className="font-semibold mb-2">Manual Verification Guide</h3>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>✓ Review the current and expected state</li>
          <li>✓ Document your findings in notes</li>
          <li>✓ Provide evidence (links, code refs)</li>
          <li>✓ Suggest a fix if applicable</li>
          <li>✓ Submit your verification</li>
          <li>✓ Results flow to audit trail</li>
        </ul>
      </div>
    </div>
  );
}
