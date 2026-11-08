import type { Metadata } from "next";

import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure AETHER routing, voice, memory and account security.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
