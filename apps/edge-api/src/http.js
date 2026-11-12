const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  });
}

export function requestId() {
  return crypto.randomUUID().replace(/-/g, "");
}

export function errorBody(code, message, details = null, id = requestId()) {
  return { error: { code, message, request_id: id, details } };
}

export function errorResponse(code, message, status = 400, details = null) {
  return json(errorBody(code, message, details), status);
}

export function corsHeaders(env, request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.CORS_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes("*")
    ? "*"
    : allowed.includes(origin)
      ? origin
      : allowed[0] || "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Accept",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function withCors(response, env, request) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(env, request))) {
    if (value) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function readJson(request, maxBytes = 1_000_000) {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new HttpError("payload_too_large", "Request body is too large", 413);
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError("validation_error", "Request body must be valid JSON", 422);
  }
}

export class HttpError extends Error {
  constructor(code, message, status = 400, details = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function sanitizeText(value, maxLength = 20000) {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, maxLength);
}

export function sanitizeFilename(name, fallback = "conversation") {
  const cleaned = (name || "")
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[\\/]/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
  return (cleaned || fallback).slice(0, 180);
}

export function scrubSecrets(text) {
  return String(text || "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[redacted]")
    .replace(/bearer\s+[A-Za-z0-9._-]{12,}/gi, "[redacted]")
    .replace(/(api[_-]?key|secret|password)\s*[=:]\s*['"]?[^\s'"]{6,}/gi, "$1=[redacted]");
}

export function estimateTokens(text) {
  return Math.max(1, Math.ceil(String(text || "").length / 4));
}

export function titleFromMessage(message) {
  const clean = String(message || "").replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 80 ? `${clean.slice(0, 77)}...` : clean;
}

export function nowIso() {
  return new Date().toISOString();
}
