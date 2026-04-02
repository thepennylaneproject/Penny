/**
 * Admin Settings API
 * Manage portfolio-wide settings: SLA, schedule, notifications
 */

import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

interface PortfolioSettings {
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

const SETTINGS_FILE = path.join(process.cwd(), "portfolio.config.json");

function loadSettings(): PortfolioSettings {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return getDefaultSettings();
  }

  try {
    const config = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
    return {
      sla: config.sla || getDefaultSettings().sla,
      audit: config.audit || getDefaultSettings().audit
    };
  } catch {
    return getDefaultSettings();
  }
}

function saveSettings(settings: PortfolioSettings) {
  const config = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
  config.sla = settings.sla;
  config.audit = settings.audit;
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(config, null, 2), "utf-8");
}

function getDefaultSettings(): PortfolioSettings {
  return {
    sla: {
      minimumCompliance: {
        perProject: 0.9,
        portfolio: 0.95,
        critical: 1.0
      },
      responseTime: {
        critical: "1 hour",
        major: "4 hours",
        minor: "24 hours"
      }
    },
    audit: {
      schedule: {
        frequency: "nightly",
        time: "02:00"
      },
      notifications: {
        slack: { enabled: true, channel: "#constraint-audits" },
        email: { enabled: false, recipients: [] }
      }
    }
  };
}

export async function GET() {
  try {
    const settings = loadSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Settings API error:", error);
    return NextResponse.json(
      { error: "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case "updateSLA":
        const settings = loadSettings();
        settings.sla = { ...settings.sla, ...data };
        saveSettings(settings);
        return NextResponse.json({ success: true, settings });

      case "updateSchedule":
        const settings2 = loadSettings();
        settings2.audit.schedule = { ...settings2.audit.schedule, ...data };
        saveSettings(settings2);
        return NextResponse.json({ success: true, settings: settings2 });

      case "updateNotifications":
        const settings3 = loadSettings();
        settings3.audit.notifications = {
          ...settings3.audit.notifications,
          ...data
        };
        saveSettings(settings3);
        return NextResponse.json({ success: true, settings: settings3 });

      case "reset":
        saveSettings(getDefaultSettings());
        return NextResponse.json({ success: true, settings: getDefaultSettings() });

      default:
        return NextResponse.json(
          { error: "Unknown action" },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Settings API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
