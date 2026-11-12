import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { backendFetch } from "@/lib/backend";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface BackendTokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url: string | null;
    preferences: Record<string, unknown>;
  };
}

async function backendLogin(email: string, password: string): Promise<BackendTokenPair | null> {
  try {
    const response = await backendFetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as BackendTokenPair;
  } catch {
    return null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET ?? "dev-only-aether-secret-change-me",
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const pair = await backendLogin(parsed.data.email, parsed.data.password);
        if (!pair) return null;
        return {
          id: pair.user.id,
          name: pair.user.name,
          email: pair.user.email,
          image: pair.user.avatar_url,
          accessToken: pair.access_token,
          refreshToken: pair.refresh_token,
          accessTokenExpiresAt: Date.now() + pair.expires_in * 1000,
          preferences: pair.user.preferences,
        } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const enriched = user as unknown as {
          accessToken: string;
          refreshToken: string;
          accessTokenExpiresAt: number;
          preferences: Record<string, unknown>;
        };
        token.accessToken = enriched.accessToken;
        token.refreshToken = enriched.refreshToken;
        token.accessTokenExpiresAt = enriched.accessTokenExpiresAt;
        token.preferences = enriched.preferences;
        token.error = undefined;
      }

      if (trigger === "update" && session) {
        const patch = session as { name?: string; preferences?: Record<string, unknown> };
        if (patch.name) token.name = patch.name;
        if (patch.preferences) token.preferences = patch.preferences;
      }

      const expiresAt = token.accessTokenExpiresAt as number | undefined;
      if (expiresAt && Date.now() > expiresAt - 30_000 && token.refreshToken) {
        try {
          const response = await backendFetch("/api/v1/auth/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: token.refreshToken }),
            cache: "no-store",
          });
          if (!response.ok) throw new Error("refresh failed");
          const pair = (await response.json()) as BackendTokenPair;
          token.accessToken = pair.access_token;
          token.refreshToken = pair.refresh_token;
          token.accessTokenExpiresAt = Date.now() + pair.expires_in * 1000;
          token.preferences = pair.user.preferences;
          token.error = undefined;
        } catch {
          token.error = "RefreshFailed";
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.preferences = token.preferences as never;
      }
      session.error = token.error as string | undefined;
      return session;
    },
  },
});
