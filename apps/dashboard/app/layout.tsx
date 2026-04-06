import type { Metadata } from "next";
import { DM_Serif_Display, Inter, JetBrains_Mono } from "next/font/google";
import { SentryVerifyButton } from "@/components/sentry-verify-button";
import { RuntimeConfigProvider } from "@/components/RuntimeConfigProvider";
import { resolveDashboardRuntimeConfig } from "@/lib/runtime-config.server";
import { UndoProvider } from "@/contexts/UndoContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
});

const dmSerifDisplay = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: "penny",
  description: "Autonomous audit & patch system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const runtimeConfig = resolveDashboardRuntimeConfig();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetBrainsMono.variable} ${dmSerifDisplay.variable}`}
    >
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
