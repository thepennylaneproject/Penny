"use client";

import React, { useEffect, useState } from "react";

interface Settings {
  sla: {
    minimumCompliance: {
      perProject: number;
      portfolio: number;
      critical: number;
    };
    responseTime: {
      critical: string;
      major: string;
      minor: string;
    };
  };
  audit: {
    schedule: {
      frequency: string;
      time: string;
    };
    notifications: {
      slack: { enabled: boolean; channel: string };
      email: { enabled: boolean; recipients: string[] };
    };
  };
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await fetch("/api/admin/settings");
      const data = await response.json();
      setSettings(data.settings);
    } catch (error) {
      setMessage({ type: "error", text: "Failed to load settings" });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateSLA",
          data: settings.sla
        })
      });
      if (response.ok) {
        setMessage({ type: "success", text: "Settings saved successfully" });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to save settings" });
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return <div className="flex items-center justify-center p-8">Loading...</div>;
  }

  return (
    <div className="space-y-6 p-6 bg-gray-50">
      <h1 className="text-3xl font-bold">Admin Settings</h1>

      {message && (
        <div
          className={`p-4 rounded ${
            message.type === "success"
              ? "bg-green-100 border border-green-400 text-green-700"
              : "bg-red-100 border border-red-400 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* SLA Settings */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">SLA Configuration</h2>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-3">Minimum Compliance Targets</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Per-Project (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(settings.sla.minimumCompliance.perProject * 100)}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      sla: {
                        ...settings.sla,
                        minimumCompliance: {
                          ...settings.sla.minimumCompliance,
                          perProject: parseInt(e.target.value) / 100
                        }
                      }
                    })
                  }
                  className="w-full px-3 py-2 border rounded"
                />
                <p className="text-xs text-gray-500 mt-1">Each project must maintain this compliance</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Portfolio (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="5"
                  value={Math.round(settings.sla.minimumCompliance.portfolio * 100)}
                  onChange={e =>
                    setSettings({
                      ...settings,
                      sla: {
                        ...settings.sla,
                        minimumCompliance: {
                          ...settings.sla.minimumCompliance,
                          portfolio: parseInt(e.target.value) / 100
                        }
                      }
                    })
                  }
                  className="w-full px-3 py-2 border rounded"
                />
                <p className="text-xs text-gray-500 mt-1">Overall portfolio compliance target</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Critical Violations</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.1"
                  value={settings.sla.minimumCompliance.critical}
                  readOnly
                  className="w-full px-3 py-2 border rounded bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">Always 1.0 (zero allowed)</p>
              </div>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold mb-3">Response Times</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {["critical", "major", "minor"].map(level => (
                <div key={level}>
                  <label className="block text-sm font-medium mb-2 capitalize">
                    {level} Violations
                  </label>
                  <input
                    type="text"
                    value={settings.sla.responseTime[level as keyof typeof settings.sla.responseTime]}
                    onChange={e =>
                      setSettings({
                        ...settings,
                        sla: {
                          ...settings.sla,
                          responseTime: {
                            ...settings.sla.responseTime,
                            [level]: e.target.value
                          }
                        }
                      })
                    }
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Audit Schedule */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Audit Schedule</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Frequency</label>
            <select
              value={settings.audit.schedule.frequency}
              onChange={e =>
                setSettings({
                  ...settings,
                  audit: {
                    ...settings.audit,
                    schedule: { ...settings.audit.schedule, frequency: e.target.value }
                  }
                })
              }
              className="w-full px-3 py-2 border rounded"
            >
              <option>nightly</option>
              <option>daily</option>
              <option>weekly</option>
              <option>manual</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Audit Time (UTC)</label>
            <input
              type="time"
              value={settings.audit.schedule.time}
              onChange={e =>
                setSettings({
                  ...settings,
                  audit: {
                    ...settings.audit,
                    schedule: { ...settings.audit.schedule, time: e.target.value }
                  }
                })
              }
              className="w-full px-3 py-2 border rounded"
            />
            <p className="text-xs text-gray-500 mt-1">Portfolio audits run at this time</p>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-2xl font-bold mb-4">Notifications</h2>

        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="slack-enabled"
                checked={settings.audit.notifications.slack.enabled}
                onChange={e =>
                  setSettings({
                    ...settings,
                    audit: {
                      ...settings.audit,
                      notifications: {
                        ...settings.audit.notifications,
                        slack: { ...settings.audit.notifications.slack, enabled: e.target.checked }
                      }
                    }
                  })
                }
              />
              <label htmlFor="slack-enabled" className="font-semibold">
                Slack Notifications
              </label>
            </div>
            {settings.audit.notifications.slack.enabled && (
              <input
                type="text"
                placeholder="#channel-name"
                value={settings.audit.notifications.slack.channel}
                onChange={e =>
                  setSettings({
                    ...settings,
                    audit: {
                      ...settings.audit,
                      notifications: {
                        ...settings.audit.notifications,
                        slack: {
                          ...settings.audit.notifications.slack,
                          channel: e.target.value
                        }
                      }
                    }
                  })
                }
                className="w-full px-3 py-2 border rounded"
              />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id="email-enabled"
                checked={settings.audit.notifications.email.enabled}
                onChange={e =>
                  setSettings({
                    ...settings,
                    audit: {
                      ...settings.audit,
                      notifications: {
                        ...settings.audit.notifications,
                        email: { ...settings.audit.notifications.email, enabled: e.target.checked }
                      }
                    }
                  })
                }
              />
              <label htmlFor="email-enabled" className="font-semibold">
                Email Notifications
              </label>
            </div>
            {settings.audit.notifications.email.enabled && (
              <input
                type="email"
                placeholder="team@company.com"
                className="w-full px-3 py-2 border rounded"
              />
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        <button
          onClick={() => {
            setSettings(null);
            void loadSettings();
          }}
          className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
