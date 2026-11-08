import type { Metadata } from "next";
import { Suspense } from "react";

import { ChatView } from "@/components/chat/chat-view";

export const metadata: Metadata = {
  title: "Chat",
  description: "Talk or type to AETHER across study, code, interviews and research.",
};

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-4rem)] items-center justify-center text-xs text-muted-foreground">
          Loading workspace…
        </div>
      }
    >
      <ChatView />
    </Suspense>
  );
}
