import type { Metadata } from "next";
import localFont from "next/font/local";
import { SentryVerifyButton } from "@/components/sentry-verify-button";
import { RuntimeConfigProvider } from "@/components/RuntimeConfigProvider";
import { resolveDashboardRuntimeConfig } from "@/lib/runtime-config.server";
import { UndoProvider } from "@/contexts/UndoContext";
import "./globals.css";

const inter = localFont({
  src: [
    {
      path: "../public/fonts/inter-latin-wght-normal.woff2",
      weight: "100 900",
      style: "normal",
    },
    {
      path: "../public/fonts/inter-latin-wght-italic.woff2",
      weight: "100 900",
      style: "italic",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

const jetBrainsMono = localFont({
  src: [
    {
      path: "../public/fonts/jetbrains-mono-latin-wght-normal.woff2",
      weight: "100 800",
      style: "normal",
    },
    {
      path: "../public/fonts/jetbrains-mono-latin-wght-italic.woff2",
      weight: "100 800",
      style: "italic",
    },
  ],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

const dmSerifDisplay = localFont({
  src: [
    {
      path: "../public/fonts/dm-serif-display-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/dm-serif-display-latin-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-dm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Penny",
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
