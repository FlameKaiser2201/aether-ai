import { signOut } from "next-auth/react";

/** Revoke the backend refresh token, then clear the Auth.js session cookie. */
export async function endSession(callbackUrl = "/"): Promise<void> {
  try {
    await fetch("/api/logout", { method: "POST", cache: "no-store" });
  } catch {
    // The cookie is still cleared client-side if revocation is unreachable.
  }
  await signOut({ callbackUrl });
}
