import { first, run } from "./db.js";
import { HttpError, nowIso } from "./http.js";

const PBKDF2_ITERATIONS = 25000;
const ACCESS_TOKEN_MINUTES = 30;
const REFRESH_TOKEN_DAYS = 30;

const DEFAULT_PREFERENCES = {
  language: "auto",
  response_style: "balanced",
  theme: "dark",
  auto_speak: true,
  continuous_listening: false,
  auto_memory: true,
  web_search_default: false,
  routing_strategy: "quality",
  voice_name: "auto",
  voice_rate: 1.0,
  voice_pitch: 1.0,
  study_level: "intermediate",
  interview_role: "",
  interview_company: "",
  timezone: "UTC",
  code_language: "python",
  show_routing: true,
  demo_banner_dismissed: false,
};

export function defaultPreferences() {
  return { ...DEFAULT_PREFERENCES };
}

export function preferencesFor(user) {
  let stored = {};
  try {
    stored = JSON.parse(user.preferences || "{}");
  } catch {
    stored = {};
  }
  return { ...DEFAULT_PREFERENCES, ...stored };
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar_url: user.avatar_url ?? null,
    auth_provider: user.auth_provider || "local",
    email_verified: Boolean(user.email_verified),
    role: user.role || "user",
    preferences: preferencesFor(user),
    created_at: user.created_at,
  };
}

function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function textBytes(value) {
  return new TextEncoder().encode(value);
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

export async function hashPassword(password, pepper) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    textBytes(`${password}${pepper || ""}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored, pepper) {
  if (!stored) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let salt;
  let expected;
  try {
    salt = b64urlDecode(parts[2]);
    expected = b64urlDecode(parts[3]);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    textBytes(`${password}${pepper || ""}`),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    expected.length * 8,
  );
  return constantTimeEqual(new Uint8Array(bits), expected);
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", textBytes(token));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    textBytes(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signJwt(payload, secret) {
  const header = b64url(textBytes(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64url(textBytes(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), textBytes(data));
  return `${data}.${b64url(new Uint8Array(signature))}`;
}

export async function verifyJwt(token, secret, expectedType) {
  if (!token || !secret) return null;
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  let signature;
  try {
    signature = b64urlDecode(parts[2]);
  } catch {
    return null;
  }
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    signature,
    textBytes(data),
  );
  if (!valid) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
  if (!payload || payload.type !== expectedType || !payload.sub) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}

export async function createAccessToken(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const minutes = Number(env.ACCESS_TOKEN_MINUTES || ACCESS_TOKEN_MINUTES);
  return signJwt(
    {
      sub: user.id,
      email: user.email,
      role: user.role || "user",
      type: "access",
      iat: now,
      exp: now + minutes * 60,
      jti: crypto.randomUUID(),
    },
    env.JWT_ACCESS_SECRET,
  );
}

export async function createRefreshToken(user, env) {
  const now = Math.floor(Date.now() / 1000);
  const days = Number(env.REFRESH_TOKEN_DAYS || REFRESH_TOKEN_DAYS);
  return signJwt(
    {
      sub: user.id,
      type: "refresh",
      iat: now,
      exp: now + days * 24 * 60 * 60,
      jti: crypto.randomUUID(),
    },
    env.JWT_REFRESH_SECRET,
  );
}

export async function issueTokenPair(db, user, env, meta = {}) {
  const accessToken = await createAccessToken(user, env);
  const refreshToken = await createRefreshToken(user, env);
  const days = Number(env.REFRESH_TOKEN_DAYS || REFRESH_TOKEN_DAYS);
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  await run(
    db,
    `INSERT INTO refresh_tokens
      (id, user_id, token_hash, expires_at, revoked_at, replaced_by, user_agent, ip_address, created_at)
     VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    crypto.randomUUID(),
    user.id,
    await hashToken(refreshToken),
    expiresAt,
    (meta.userAgent || "").slice(0, 512) || null,
    (meta.ip || "").slice(0, 64) || null,
    nowIso(),
  );
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: Number(env.ACCESS_TOKEN_MINUTES || ACCESS_TOKEN_MINUTES) * 60,
    user: publicUser(user),
  };
}

export async function authenticate(request, env, db) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const payload = await verifyJwt(token, env.JWT_ACCESS_SECRET, "access");
  if (!payload) return null;
  const user = await first(db, "SELECT * FROM users WHERE id = ?", payload.sub);
  if (!user || !user.is_active) return null;
  return user;
}

export async function requireUser(request, env, db) {
  const user = await authenticate(request, env, db);
  if (!user) {
    throw new HttpError("unauthorized", "Please sign in to continue.", 401);
  }
  return user;
}

export function validateEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new HttpError("validation_error", "Enter a valid email address.", 422);
  }
  return email;
}

export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128) {
    throw new HttpError("validation_error", "Password must be 10-128 characters.", 422);
  }
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new HttpError(
      "validation_error",
      "Password must include a lowercase letter, an uppercase letter and a digit.",
      422,
    );
  }
  return password;
}

export async function registerUser(db, env, payload, meta) {
  const email = validateEmail(payload.email);
  const password = validatePassword(payload.password);
  const name = String(payload.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) throw new HttpError("validation_error", "Name cannot be blank.", 422);
  const existing = await first(db, "SELECT id FROM users WHERE email = ?", email);
  if (existing) {
    throw new HttpError("email_in_use", "An account with this email already exists", 409);
  }
  const now = nowIso();
  const user = {
    id: crypto.randomUUID(),
    email,
    password_hash: await hashPassword(password, env.PASSWORD_PEPPER),
    name,
    avatar_url: null,
    auth_provider: "local",
    email_verified: 0,
    is_active: 1,
    role: "user",
    preferences: JSON.stringify(defaultPreferences()),
    created_at: now,
    updated_at: now,
    last_login_at: null,
  };
  await run(
    db,
    `INSERT INTO users
      (id, email, password_hash, name, avatar_url, auth_provider, email_verified,
       is_active, role, preferences, created_at, updated_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    user.id,
    user.email,
    user.password_hash,
    user.name,
    user.avatar_url,
    user.auth_provider,
    user.email_verified,
    user.is_active,
    user.role,
    user.preferences,
    user.created_at,
    user.updated_at,
    user.last_login_at,
  );
  return issueTokenPair(db, user, env, meta);
}

export async function loginUser(db, env, payload, meta) {
  const email = validateEmail(payload.email);
  const password = String(payload.password || "");
  const user = await first(db, "SELECT * FROM users WHERE email = ?", email);
  if (!user || !(await verifyPassword(password, user.password_hash, env.PASSWORD_PEPPER))) {
    throw new HttpError("invalid_credentials", "Email or password is incorrect", 401);
  }
  if (!user.is_active) {
    throw new HttpError("account_disabled", "This account is disabled", 403);
  }
  await run(db, "UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?", nowIso(), nowIso(), user.id);
  user.last_login_at = nowIso();
  return issueTokenPair(db, user, env, meta);
}

export async function refreshTokenPair(db, env, rawToken, meta) {
  const payload = await verifyJwt(rawToken, env.JWT_REFRESH_SECRET, "refresh");
  if (!payload) {
    throw new HttpError("invalid_refresh", "Session expired. Please sign in again.", 401);
  }
  const tokenHash = await hashToken(rawToken);
  const stored = await first(db, "SELECT * FROM refresh_tokens WHERE token_hash = ?", tokenHash);
  if (!stored || stored.user_id !== payload.sub) {
    throw new HttpError("invalid_refresh", "Session is no longer valid", 401);
  }
  if (stored.revoked_at) {
    await run(
      db,
      "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
      nowIso(),
      stored.user_id,
    );
    throw new HttpError("token_reuse", "Session reuse detected. Please sign in again.", 401);
  }
  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    throw new HttpError("invalid_refresh", "Session expired. Please sign in again.", 401);
  }
  const user = await first(db, "SELECT * FROM users WHERE id = ?", stored.user_id);
  if (!user || !user.is_active) {
    throw new HttpError("invalid_refresh", "Account is not available", 401);
  }
  const pair = await issueTokenPair(db, user, env, meta);
  await run(
    db,
    "UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?",
    nowIso(),
    await hashToken(pair.refresh_token),
    stored.id,
  );
  return pair;
}

export async function revokeRefreshToken(db, rawToken) {
  if (!rawToken) return;
  await run(
    db,
    "UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    nowIso(),
    await hashToken(rawToken),
  );
}

export async function revokeAllRefreshTokens(db, userId) {
  await run(
    db,
    "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    nowIso(),
    userId,
  );
}

export async function changePassword(db, env, user, currentPassword, newPassword) {
  if (!(await verifyPassword(currentPassword, user.password_hash, env.PASSWORD_PEPPER))) {
    throw new HttpError("invalid_credentials", "Current password is incorrect", 401);
  }
  const password = validatePassword(newPassword);
  await run(
    db,
    "UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
    await hashPassword(password, env.PASSWORD_PEPPER),
    nowIso(),
    user.id,
  );
  await revokeAllRefreshTokens(db, user.id);
}
