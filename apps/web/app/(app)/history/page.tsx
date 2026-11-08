import type { Metadata } from "next";

import { HistoryView } from "@/components/history/history-view";

export const metadata: Metadata = {
  title: "History",
  description: "Search, export and manage every AETHER conversation.",
};

export default function HistoryPage() {
  return <HistoryView />;
}
