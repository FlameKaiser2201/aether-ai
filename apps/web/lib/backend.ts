import { getCloudflareContext } from "@opennextjs/cloudflare";

const DEFAULT_API_URL = "http://localhost:8000";

interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

/**
 * Resolve the AETHER API fetch implementation.
 *
 * In production the web Worker and the API Worker share the same
 * `workers.dev` zone, and Cloudflare rejects Worker-to-Worker subrequests on
 * that zone with error 1042. A service binding routes the call internally
 * instead. Local development and `next build` fall back to API_URL.
 */
function apiBinding(): ServiceBinding | null {
  try {
    const { env } = getCloudflareContext();
    const binding = (env as unknown as { API?: ServiceBinding }).API;
    return binding ?? null;
  } catch {
    return null;
  }
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const binding = apiBinding();
  if (binding) {
    return binding.fetch(new Request(`https://aether-api-edge${normalized}`, init));
  }
  const base = process.env.API_URL ?? DEFAULT_API_URL;
  return fetch(`${base}${normalized}`, init);
}
