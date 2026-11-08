import type { Metadata } from "next";

import { VoiceView } from "@/components/voice/voice-view";

export const metadata: Metadata = {
  title: "Voice",
  description: "Hands-free conversation with streaming speech and memory.",
};

export default function VoicePage() {
  return <VoiceView />;
}
