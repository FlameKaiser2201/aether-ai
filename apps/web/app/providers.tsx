"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        theme="dark"
        position="top-right"
        toastOptions={{
          style: {
            background: "rgba(11, 16, 32, 0.96)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e2e8f0",
            backdropFilter: "blur(18px)",
          },
        }}
      />
    </SessionProvider>
  );
}
