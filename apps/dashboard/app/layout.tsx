import type { Metadata } from "next";
import { SentryVerifyButton } from "@/components/sentry-verify-button";
import { RuntimeConfigProvider } from "@/components/RuntimeConfigProvider";
import { resolveDashboardRuntimeConfig } from "@/lib/runtime-config.server";
import { UndoProvider } from "@/contexts/UndoContext";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Penny",
    template: "%s — Penny",
  },
  description: "Autonomous audit & patch system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeConfig = resolveDashboardRuntimeConfig();

  return (
    <html lang="en">
      <body className="antialiased min-h-screen">
        <UndoProvider>
          <RuntimeConfigProvider
            laneBaseUrl={runtimeConfig.laneBaseUrl}
            laneServerConfigured={runtimeConfig.laneServerConfigured}
          >
            {children}
          </RuntimeConfigProvider>
        </UndoProvider>
        <SentryVerifyButton />
      </body>
    </html>
  );
}
