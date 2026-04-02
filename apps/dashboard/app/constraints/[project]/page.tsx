"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface Constraint {
  id: string;
  name: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  difficulty: "easy" | "moderate" | "complex";
  description: string;
}

interface PageProps {
  params: {
    project: string;
  };
}

export default function ProjectConstraintsPage({ params }: PageProps) {
  const { project } = params;
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [showAddNew, setShowAddNew] = useState(false);

  useEffect(() => {
    loadConstraints();
  }, [project]);

  const loadConstraints = async () => {
    try {
      setLoading(true);
      // Mock data for Embr
      if (project === "embr") {
        setConstraints([
          {
            id: "embr-001",
            name: "Turborepo monorepo structure",
            category: "architecture",
            severity: "high",
            difficulty: "easy",
            description: "Must maintain Turborepo monorepo structure"
          },
          {
            id: "embr-002",
            name: "TypeScript strict mode",
            category: "code-quality",
            severity: "critical",
            difficulty: "easy",
            description: "TypeScript strict mode must be enabled in API"
          },
          {
            id: "embr-010",
            name: "Creator revenue split 85-90%",
            category: "business-logic",
            severity: "critical",
            difficulty: "complex",
            description: "Creator share must be between 85-90%"
          }
        ]);
      }
    } catch (error) {
      console.error("Failed to load constraints:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (constraint: Constraint) => {
    try {
      // API call would go here
      setEditing(null);
      // Refresh list
      await loadConstraints();
    } catch (error) {
      console.error("Failed to save constraint:", error);
    }
  };

  const handleDelete = async (constraintId: string) => {
    if (!confirm("Delete this constraint?")) return;
    try {
      // API call would go here
      setConstraints(constraints.filter(c => c.id !== constraintId));
    } catch (error) {
      console.error("Failed to delete constraint:", error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8">Loading...</div>;
  }

  const severityColors = {
    critical: "bg-red-100 text-red-800",
    high: "bg-orange-100 text-orange-800",
    medium: "bg-yellow-100 text-yellow-800",
    low: "bg-green-100 text-green-800"
  };

  const difficultyColors = {
    easy: "bg-green-50 border-green-200",
    moderate: "bg-yellow-50 border-yellow-200",
    complex: "bg-red-50 border-red-200"
  };

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      <div className="flex justify-between items-center">
        <div>
          <Link href="/constraints" className="text-blue-600 hover:underline">
            ← Back to Constraints
          </Link>
          <h1 className="text-3xl font-bold mt-2">{project} Constraints</h1>
          <p className="text-gray-600 mt-1">{constraints.length} constraints defined</p>
        </div>
        <button
          onClick={() => setShowAddNew(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Add Constraint
        </button>
      </div>

      {showAddNew && (
        <div className="bg-white p-6 rounded-lg shadow border-2 border-blue-200">
          <h2 className="text-xl font-bold mb-4">Add New Constraint</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                placeholder="e.g., JWT on all protected routes"
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Severity</label>
                <select className="w-full px-3 py-2 border rounded">
                  <option>critical</option>
                  <option>high</option>
                  <option>medium</option>
                  <option>low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Difficulty</label>
                <select className="w-full px-3 py-2 border rounded">
                  <option>easy</option>
                  <option>moderate</option>
                  <option>complex</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                placeholder="Describe what must be true..."
                rows={3}
                className="w-full px-3 py-2 border rounded"
              />
            </div>
            <div className="flex gap-2">
              <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                Save Constraint
              </button>
              <button
                onClick={() => setShowAddNew(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {constraints.map(constraint => (
          <div
            key={constraint.id}
            className={`p-4 rounded-lg border-2 ${difficultyColors[constraint.difficulty]}`}
          >
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold">{constraint.name}</h3>
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${severityColors[constraint.severity]}`}>
                    {constraint.severity}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    {constraint.difficulty}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                    {constraint.category}
                  </span>
                </div>
                <p className="text-gray-700">{constraint.description}</p>
                <p className="text-sm text-gray-500 mt-2">ID: {constraint.id}</p>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => setEditing(constraint.id)}
                  className="px-3 py-1 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-sm"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(constraint.id)}
                  className="px-3 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100 text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Statistics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total</p>
            <p className="text-2xl font-bold">{constraints.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Critical</p>
            <p className="text-2xl font-bold text-red-600">
              {constraints.filter(c => c.severity === "critical").length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Easy</p>
            <p className="text-2xl font-bold text-green-600">
              {constraints.filter(c => c.difficulty === "easy").length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Complex</p>
            <p className="text-2xl font-bold text-red-600">
              {constraints.filter(c => c.difficulty === "complex").length}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border-2 border-gray-200 rounded hover:border-blue-400 text-left">
            <p className="font-semibold">📥 Import from CSV</p>
            <p className="text-sm text-gray-600">Bulk update constraints</p>
          </button>
          <button className="p-4 border-2 border-gray-200 rounded hover:border-blue-400 text-left">
            <p className="font-semibold">📤 Export as CSV</p>
            <p className="text-sm text-gray-600">Download for analysis</p>
          </button>
          <button className="p-4 border-2 border-gray-200 rounded hover:border-blue-400 text-left">
            <p className="font-semibold">🔄 Run Audit</p>
            <p className="text-sm text-gray-600">Test these constraints</p>
          </button>
        </div>
      </div>
    </div>
  );
}
