"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface ProjectWithStats {
  id: string;
  name: string;
  total: number;
  bySeverity: Record<string, number>;
  byDifficulty: Record<string, number>;
  byCategory: Record<string, number>;
}

export default function ConstraintsPage() {
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      // In real implementation, would fetch from API
      // For now, mock data
      setProjects([
        {
          id: "embr",
          name: "Embr",
          total: 17,
          bySeverity: { critical: 12, high: 5, medium: 0, low: 0 },
          byDifficulty: { easy: 7, moderate: 4, complex: 6 },
          byCategory: { security: 4, "business-logic": 4, operations: 3, "code-quality": 2, "data-integrity": 2, performance: 2 }
        },
        {
          id: "codra",
          name: "Codra",
          total: 16,
          bySeverity: { critical: 8, high: 7, medium: 1, low: 0 },
          byDifficulty: { easy: 5, moderate: 6, complex: 5 },
          byCategory: { security: 3, "data-integrity": 4, "code-quality": 3, operations: 3, performance: 3 }
        },
        {
          id: "relevnt",
          name: "Relevnt",
          total: 20,
          bySeverity: { critical: 14, high: 5, medium: 1, low: 0 },
          byDifficulty: { easy: 6, moderate: 7, complex: 7 },
          byCategory: { security: 5, "data-integrity": 6, operations: 4, "code-quality": 3, performance: 2 }
        }
      ]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p>Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Constraint Management</h1>
        <Link
          href="/admin/extract"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          + Extract New
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {projects.map(project => (
          <Link
            key={project.id}
            href={`/constraints/${project.id}`}
            className="block p-6 bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold">{project.name}</h2>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                {project.total} constraints
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">
                  By Severity
                </h3>
                <div className="flex gap-2">
                  {project.bySeverity.critical > 0 && (
                    <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                      {project.bySeverity.critical} critical
                    </span>
                  )}
                  {project.bySeverity.high > 0 && (
                    <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                      {project.bySeverity.high} high
                    </span>
                  )}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">
                  By Difficulty
                </h3>
                <div className="flex gap-2">
                  <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                    {project.byDifficulty.easy} easy
                  </span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs">
                    {project.byDifficulty.moderate} moderate
                  </span>
                  <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                    {project.byDifficulty.complex} complex
                  </span>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-sm text-gray-600 mb-2">
                  Top Categories
                </h3>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(project.byCategory)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 3)
                    .map(([category, count]) => (
                      <span
                        key={category}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                      >
                        {category} ({count})
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t flex gap-2">
              <button className="flex-1 px-3 py-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 text-sm font-medium">
                Edit
              </button>
              <button className="flex-1 px-3 py-2 bg-gray-50 text-gray-600 rounded hover:bg-gray-100 text-sm font-medium">
                Export
              </button>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-bold mb-4">Portfolio Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Projects</p>
            <p className="text-2xl font-bold">{projects.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Constraints</p>
            <p className="text-2xl font-bold">
              {projects.reduce((sum, p) => sum + p.total, 0)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Critical</p>
            <p className="text-2xl font-bold text-red-600">
              {projects.reduce((sum, p) => sum + p.bySeverity.critical, 0)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Easy Checks</p>
            <p className="text-2xl font-bold text-green-600">
              {projects.reduce((sum, p) => sum + p.byDifficulty.easy, 0)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
