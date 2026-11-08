import type { DefaultSession } from "next-auth";

import type { UserPreferences } from "@/lib/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      preferences: UserPreferences;
    } & DefaultSession["user"];
    error?: string;
  }

  interface User {
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: number;
    preferences: Record<string, unknown>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number;
    preferences?: Record<string, unknown>;
    error?: string;
  }
}
