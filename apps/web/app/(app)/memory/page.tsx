import type { Metadata } from "next";

import { MemoryView } from "@/components/memory/memory-view";

export const metadata: Metadata = {
  title: "Memory",
  description: "Inspect, edit and erase the context AETHER remembers about you.",
};

export default function MemoryPage() {
  return <MemoryView />;
}
