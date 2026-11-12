import {
  authenticate,
  changePassword,
  defaultPreferences,
  issueTokenPair,
  loginUser,
  preferencesFor,
  publicUser,
  refreshTokenPair,
  registerUser,
  requireUser,
  revokeRefreshToken,
} from "./auth.js";
import {
  chatResponseFromEvents,
  detectProviders,
  runChat,
} from "./chat.js";
import {
  all,
  conversationOut,
  first,
  memoryOut,
  messageOut,
  parseJson,
  run,
  taskOut,
} from "./db.js";
import {
  errorBody,
  errorResponse,
  estimateTokens,
  HttpError,
  json,
  nowIso,
  readJson,
  requestId,
  sanitizeFilename,
  sanitizeText,
  titleFromMessage,
  withCors,
} from "./http.js";
import { searchWeb } from "./search.js";

const VALID_MODES = new Set([
  "auto",
  "general",
  "study",
  "coding",
  "interview",
  "research",
  "voice",
]);

function clientMeta(request) {
  return {
    userAgent: request.headers.get("User-Agent") || "",
    ip: request.headers.get("CF-Connecting-IP") || "",
  };
}

function parts(url) {
  return url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}

function positiveInt(value, fallback, max = 100) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(Math.floor(number), max);
}

function offsetValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.floor(number);
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      throw new HttpError("validation_error", `${field} is required`, 422);
    }
  }
}

async function health(env, db) {
  const providers = detectProviders(env);
  return {
    status: "ok",
    name: env.APP_NAME || "AETHER API (Edge)",
    version: env.APP_VERSION || "1.0.0",
    runtime: "cloudflare-workers",
    storage: "d1",
    commit: env.DEPLOY_COMMIT || "",
    demo_mode: providers.length === 0,
  };
}

async function providerReport(env) {
  const providers = detectProviders(env);
  const report = {};
  for (const provider of providers) {
    report[provider.id] = {
      label: provider.label,
      base_url: provider.baseUrl,
      models: { ...provider.models },
    };
  }
  const selected = {};
  for (const tier of ["fast", "balanced", "reasoning", "coding", "vision"]) {
    const provider = providers.find((item) => item.models[tier]);
    if (provider) selected[tier] = `${provider.id}/${provider.models[tier]}`;
  }
  return {
    demo_mode: providers.length === 0,
    priority: providers.map((provider) => provider.id),
    providers: report,
    selected,
    validation_issues: [],
  };
}

async function ready(env, db) {
  let database = false;
  try {
    await first(db, "SELECT 1 AS ok");
    database = true;
  } catch {
    database = false;
  }
  return {
    status: database ? "ready" : "degraded",
    database,
    redis: false,
    storage: "d1",
    commit: env.DEPLOY_COMMIT || "",
    demo_mode: detectProviders(env).length === 0,
    providers: detectProviders(env).length,
  };
}

async function getOrCreateConversation(db, user, payload) {
  if (payload.conversation_id) {
    const existing = await first(
      db,
      "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
      String(payload.conversation_id),
      user.id,
    );
    if (!existing) throw new HttpError("not_found", "Conversation not found", 404);
    return existing;
  }
  const now = nowIso();
  const conversation = {
    id: crypto.randomUUID(),
    user_id: user.id,
    title: "New conversation",
    mode: VALID_MODES.has(payload.mode) ? payload.mode : "general",
    summary: null,
    message_count: 0,
    pinned: 0,
    archived: 0,
    last_message_at: null,
    created_at: now,
    updated_at: now,
  };
  await run(
    db,
    `INSERT INTO conversations
      (id, user_id, title, mode, summary, message_count, pinned, archived,
       last_message_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    conversation.id,
    conversation.user_id,
    conversation.title,
    conversation.mode,
    conversation.summary,
    conversation.message_count,
    conversation.pinned,
    conversation.archived,
    conversation.last_message_at,
    conversation.created_at,
    conversation.updated_at,
  );
  return conversation;
}

async function loadHistory(db, conversationId, limit = 40) {
  const rows = await all(
    db,
    `SELECT role, content FROM messages
     WHERE conversation_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    conversationId,
    limit,
  );
  return rows.reverse();
}

async function saveUserMessage(db, conversation, content) {
  const now = nowIso();
  const id = crypto.randomUUID();
  await run(
    db,
    `INSERT INTO messages
      (id, conversation_id, role, content, provider, model, input_tokens,
       output_tokens, latency_ms, citations, meta, created_at)
     VALUES (?, ?, 'user', ?, NULL, NULL, 0, 0, 0, '[]', '{}', ?)`,
    id,
    conversation.id,
    content,
    now,
  );
  await run(
    db,
    `UPDATE conversations
     SET message_count = (SELECT COUNT(*) FROM messages WHERE conversation_id = ?),
         last_message_at = ?, updated_at = ?
     WHERE id = ?`,
    conversation.id,
    now,
    now,
    conversation.id,
  );
  return { id, role: "user", content, created_at: now };
}

async function handleAuth(request, env, db, path, method) {
  const meta = clientMeta(request);
  if (path === "register" && method === "POST") {
    const body = await readJson(request);
    requireFields(body, ["email", "password", "name"]);
    const pair = await registerUser(db, env, body, meta);
    return json(pair, 201);
  }
  if (path === "login" && method === "POST") {
    const body = await readJson(request);
    requireFields(body, ["email", "password"]);
    return json(await loginUser(db, env, body, meta));
  }
  if (path === "refresh" && method === "POST") {
    const body = await readJson(request);
    requireFields(body, ["refresh_token"]);
    return json(await refreshTokenPair(db, env, String(body.refresh_token), meta));
  }
  if (path === "logout" && method === "POST") {
    const body = await readJson(request);
    if (body.refresh_token) await revokeRefreshToken(db, String(body.refresh_token));
    return new Response(null, { status: 204 });
  }
  if (path === "me" && method === "GET") {
    const user = await requireUser(request, env, db);
    return json(publicUser(user));
  }
  if (path === "me" && method === "PATCH") {
    const user = await requireUser(request, env, db);
    const body = await readJson(request);
    if (body.name !== undefined) {
      const name = sanitizeText(body.name, 80).trim();
      if (!name) throw new HttpError("validation_error", "Name cannot be blank", 422);
      await run(db, "UPDATE users SET name = ?, updated_at = ? WHERE id = ?", name, nowIso(), user.id);
      user.name = name;
    }
    if (body.avatar_url !== undefined) {
      const avatar = body.avatar_url ? String(body.avatar_url) : null;
      if (avatar && !/^https?:\/\//i.test(avatar)) {
        throw new HttpError("validation_error", "Avatar URL must be HTTP(S)", 422);
      }
      await run(
        db,
        "UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?",
        avatar,
        nowIso(),
        user.id,
      );
      user.avatar_url = avatar;
    }
    return json(publicUser(user));
  }
  if (path === "change-password" && method === "POST") {
    const user = await requireUser(request, env, db);
    const body = await readJson(request);
    requireFields(body, ["current_password", "new_password"]);
    await changePassword(db, env, user, String(body.current_password), String(body.new_password));
    return new Response(null, { status: 204 });
  }
  if (path === "oauth" && method === "POST") {
    throw new HttpError(
      "not_implemented",
      "OAuth account linking is not available on the edge deployment yet.",
      501,
    );
  }
  return null;
}

async function handleConversations(request, env, db, segments, method) {
  const user = await requireUser(request, env, db);
  if (segments.length === 0 && method === "GET") {
    const url = new URL(request.url);
    const limit = positiveInt(url.searchParams.get("limit"), 30, 100);
    const offset = offsetValue(url.searchParams.get("offset"));
    const archived = url.searchParams.get("archived") === "true";
    const query = (url.searchParams.get("query") || "").trim();
    const filters = ["user_id = ?", "archived = ?"];
    const bindings = [user.id, archived ? 1 : 0];
    if (query) {
      filters.push("(title LIKE ? OR summary LIKE ?)");
      bindings.push(`%${query}%`, `%${query}%`);
    }
    const where = filters.join(" AND ");
    const totalRow = await first(
      db,
      `SELECT COUNT(*) AS n FROM conversations WHERE ${where}`,
      ...bindings,
    );
    const rows = await all(
      db,
      `SELECT * FROM conversations WHERE ${where}
       ORDER BY pinned DESC, updated_at DESC
       LIMIT ? OFFSET ?`,
      ...bindings,
      limit,
      offset,
    );
    return json({
      items: rows.map(conversationOut),
      total: Number(totalRow?.n || 0),
      limit,
      offset,
    });
  }
  if (segments.length === 0 && method === "POST") {
    const body = await readJson(request);
    const now = nowIso();
    const conversation = {
      id: crypto.randomUUID(),
      user_id: user.id,
      title: sanitizeText(body.title || "New conversation", 160).trim() || "New conversation",
      mode: VALID_MODES.has(body.mode) ? body.mode : "general",
      summary: null,
      message_count: 0,
      pinned: 0,
      archived: 0,
      last_message_at: null,
      created_at: now,
      updated_at: now,
    };
    await run(
      db,
      `INSERT INTO conversations
        (id, user_id, title, mode, summary, message_count, pinned, archived,
         last_message_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      conversation.id,
      conversation.user_id,
      conversation.title,
      conversation.mode,
      conversation.summary,
      conversation.message_count,
      conversation.pinned,
      conversation.archived,
      conversation.last_message_at,
      conversation.created_at,
      conversation.updated_at,
    );
    return json(conversationOut(conversation), 201);
  }

  const id = segments[0];
  const row = await first(
    db,
    "SELECT * FROM conversations WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!row) throw new HttpError("not_found", "Conversation not found", 404);

  if (segments.length === 1 && method === "GET") {
    const url = new URL(request.url);
    const limit = positiveInt(url.searchParams.get("message_limit"), 200, 500);
    const messages = await all(
      db,
      `SELECT * FROM messages WHERE conversation_id = ?
       ORDER BY created_at ASC LIMIT ?`,
      id,
      limit,
    );
    return json({
      ...conversationOut(row),
      messages: messages.map(messageOut),
    });
  }
  if (segments.length === 1 && method === "PATCH") {
    const body = await readJson(request);
    const updates = [];
    const bindings = [];
    if (body.title !== undefined) {
      const title = sanitizeText(body.title, 160).trim();
      if (!title) throw new HttpError("validation_error", "Title cannot be blank", 422);
      updates.push("title = ?");
      bindings.push(title);
    }
    if (body.pinned !== undefined) {
      updates.push("pinned = ?");
      bindings.push(body.pinned ? 1 : 0);
    }
    if (body.archived !== undefined) {
      updates.push("archived = ?");
      bindings.push(body.archived ? 1 : 0);
    }
    if (updates.length) {
      updates.push("updated_at = ?");
      bindings.push(nowIso(), id, user.id);
      await run(
        db,
        `UPDATE conversations SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
        ...bindings,
      );
    }
    const updated = await first(db, "SELECT * FROM conversations WHERE id = ?", id);
    return json(conversationOut(updated));
  }
  if (segments.length === 1 && method === "DELETE") {
    await run(db, "DELETE FROM messages WHERE conversation_id = ?", id);
    await run(db, "DELETE FROM conversations WHERE id = ? AND user_id = ?", id, user.id);
    return new Response(null, { status: 204 });
  }
  if (segments.length === 2 && segments[1] === "export" && method === "GET") {
    const url = new URL(request.url);
    const format = url.searchParams.get("format") === "json" ? "json" : "md";
    const messages = await all(
      db,
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC",
      id,
    );
    let content;
    let contentType;
    let extension;
    if (format === "json") {
      content = JSON.stringify(
        {
          id: row.id,
          title: row.title,
          mode: row.mode,
          summary: row.summary,
          created_at: row.created_at,
          messages: messages.map((message) => ({
            role: message.role,
            content: message.content,
            created_at: message.created_at,
            citations: parseJson(message.citations, []),
          })),
        },
        null,
        2,
      );
      contentType = "application/json";
      extension = "json";
    } else {
      const lines = [`# ${row.title}`, "", `_Exported from AETHER - ${row.created_at.slice(0, 10)}_`, ""];
      if (row.summary) lines.push("## Summary", row.summary, "");
      for (const message of messages) {
        lines.push(`## ${message.role === "user" ? "You" : "AETHER"}`, message.content, "");
      }
      content = lines.join("\n");
      contentType = "text/markdown; charset=utf-8";
      extension = "md";
    }
    const filename = `${sanitizeFilename(row.title)}.${extension}`;
    return new Response(content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }
  return null;
}

async function handleChat(request, env, db, stream, ctx) {
  const user = await requireUser(request, env, db);
  const body = await readJson(request);
  const message = sanitizeText(body.message, 20000).trim();
  if (!message) throw new HttpError("validation_error", "Message cannot be blank", 422);
  if (Array.isArray(body.file_ids) && body.file_ids.length) {
    throw new HttpError(
      "file_unsupported",
      "File attachments are not available on the edge deployment yet.",
      501,
    );
  }
  if (body.mode && !VALID_MODES.has(body.mode)) {
    throw new HttpError("validation_error", "Unknown chat mode", 422);
  }
  const payload = {
    message,
    conversation_id: body.conversation_id || null,
    mode: body.mode || "auto",
    web_search:
      body.web_search === true ? true : body.web_search === false ? false : null,
    voice: Boolean(body.voice),
    language: body.language || null,
  };
  const conversation = await getOrCreateConversation(db, user, payload);
  const history = await loadHistory(db, conversation.id, 40);
  const userMessage = await saveUserMessage(db, conversation, message);
  const rid = requestId();
  const events = runChat({
    env,
    db,
    user,
    payload,
    conversation,
    history,
    userMessage,
    requestId: rid,
    signal: request.signal,
  });

  if (!stream) {
    const collected = [];
    for await (const event of events) collected.push(event);
    const result = await chatResponseFromEvents(collected, db);
    if (result.error) {
      return json(errorBody(result.error.code, result.error.message, result.error.details, rid), 502);
    }
    return json(result);
  }

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(
            encoder.encode(
              `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`,
            ),
          );
        }
      } catch (error) {
        const details = {
          type: error?.name || "Error",
          reason: String(error?.message || error).slice(0, 400),
        };
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              code: "chat_failed",
              message: "I couldn't complete that response. Please try again.",
              details,
            })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });
  ctx.waitUntil(Promise.resolve());
  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function settingsPayload(env, user) {
  const preferences = preferencesFor(user);
  const providers = detectProviders(env);
  const availability = {};
  for (const provider of providers) {
    availability[provider.id] = {
      chat: true,
      streaming: true,
      embeddings: false,
      vision: Boolean(provider.vision),
      stt: false,
      tts: false,
      demo: false,
    };
  }
  const catalog = [];
  for (const tier of ["fast", "balanced", "reasoning", "coding", "vision"]) {
    for (const provider of providers) {
      const model = provider.models[tier];
      if (model) {
        catalog.push({ tier, provider: provider.id, model, available: true });
      }
    }
  }
  return {
    preferences,
    capabilities: {
      providers: availability,
      demo_mode: providers.length === 0,
      web_search: true,
      storage: "d1",
      redis: false,
    },
    routing_strategy: preferences.routing_strategy,
    model_catalog: catalog,
    limits: {
      max_upload_mb: 20,
      chat_per_minute: 30,
      context_tokens: Number(env.CONTEXT_TOKEN_BUDGET || 24000),
      max_output_tokens: Number(env.MAX_OUTPUT_TOKENS || 4096),
      max_memories: 200,
    },
  };
}

async function handleSettings(request, env, db, method) {
  const user = await requireUser(request, env, db);
  if (method === "GET") return json(settingsPayload(env, user));
  if (method === "PATCH") {
    const body = await readJson(request);
    const current = preferencesFor(user);
    const allowed = new Set(Object.keys(defaultPreferences()));
    const merged = { ...current };
    for (const [key, value] of Object.entries(body)) {
      if (!allowed.has(key) || value === null || value === undefined) continue;
      merged[key] = value;
    }
    if (!["quality", "cost", "local"].includes(merged.routing_strategy)) {
      merged.routing_strategy = "quality";
    }
    await run(
      db,
      "UPDATE users SET preferences = ?, updated_at = ? WHERE id = ?",
      JSON.stringify(merged),
      nowIso(),
      user.id,
    );
    user.preferences = JSON.stringify(merged);
    return json({ preferences: merged });
  }
  return null;
}

async function handleMemories(request, env, db, segments, method) {
  const user = await requireUser(request, env, db);
  if (segments.length === 0 && method === "GET") {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const query = (url.searchParams.get("q") || "").trim();
    const filters = ["user_id = ?"];
    const bindings = [user.id];
    if (category) {
      filters.push("category = ?");
      bindings.push(category);
    }
    if (query) {
      filters.push("(key LIKE ? OR value LIKE ?)");
      bindings.push(`%${query}%`, `%${query}%`);
    }
    const rows = await all(
      db,
      `SELECT * FROM memories WHERE ${filters.join(" AND ")}
       ORDER BY updated_at DESC LIMIT 500`,
      ...bindings,
    );
    const totalRow = await first(
      db,
      "SELECT COUNT(*) AS n FROM memories WHERE user_id = ?",
      user.id,
    );
    const counts = await all(
      db,
      "SELECT category, COUNT(*) AS n FROM memories WHERE user_id = ? GROUP BY category",
      user.id,
    );
    return json({
      items: rows.map(memoryOut),
      total: Number(totalRow?.n || 0),
      categories: Object.fromEntries(counts.map((item) => [item.category, Number(item.n)])),
    });
  }
  if (segments.length === 0 && method === "POST") {
    const body = await readJson(request);
    requireFields(body, ["key", "value"]);
    const now = nowIso();
    const id = crypto.randomUUID();
    const category = sanitizeText(body.category || "fact", 32) || "fact";
    const key = sanitizeText(body.key, 160).trim();
    const value = sanitizeText(body.value, 10000).trim();
    if (!key || !value) throw new HttpError("validation_error", "Memory key and value are required", 422);
    const existing = await first(
      db,
      "SELECT * FROM memories WHERE user_id = ? AND category = ? AND key = ?",
      user.id,
      category,
      key,
    );
    if (existing) {
      await run(
        db,
        "UPDATE memories SET value = ?, confidence = ?, updated_at = ? WHERE id = ?",
        value,
        Number(body.confidence ?? 0.8),
        now,
        existing.id,
      );
      const updated = await first(db, "SELECT * FROM memories WHERE id = ?", existing.id);
      return json(memoryOut(updated), 201);
    }
    await run(
      db,
      `INSERT INTO memories
        (id, user_id, category, key, value, confidence, source_conversation_id,
         last_used_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
      id,
      user.id,
      category,
      key,
      value,
      Number(body.confidence ?? 0.8),
      body.source_conversation_id || null,
      now,
      now,
    );
    const created = await first(db, "SELECT * FROM memories WHERE id = ?", id);
    return json(memoryOut(created), 201);
  }
  if (segments.length === 0 && method === "DELETE") {
    const result = await run(db, "DELETE FROM memories WHERE user_id = ?", user.id);
    return json({ deleted: Number(result.meta?.changes || 0) });
  }
  const id = segments[0];
  const memory = await first(
    db,
    "SELECT * FROM memories WHERE id = ? AND user_id = ?",
    id,
    user.id,
  );
  if (!memory) throw new HttpError("not_found", "Memory not found", 404);
  if (method === "PATCH") {
    const body = await readJson(request);
    const updates = [];
    const bindings = [];
    for (const field of ["category", "key", "value"]) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        bindings.push(sanitizeText(body[field], field === "value" ? 10000 : 160).trim());
      }
    }
    if (body.confidence !== undefined) {
      updates.push("confidence = ?");
      bindings.push(Number(body.confidence));
    }
    if (updates.length) {
      updates.push("updated_at = ?");
      bindings.push(nowIso(), id, user.id);
      await run(
        db,
        `UPDATE memories SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`,
        ...bindings,
      );
    }
    const updated = await first(db, "SELECT * FROM memories WHERE id = ?", id);
    return json(memoryOut(updated));
  }
  if (method === "DELETE") {
    await run(db, "DELETE FROM memories WHERE id = ? AND user_id = ?", id, user.id);
    return new Response(null, { status: 204 });
  }
  return null;
}

async function handleTasks(request, env, db, segments, method) {
  const user = await requireUser(request, env, db);
  if (segments.length === 0 && method === "GET") {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const filters = ["user_id = ?"];
    const bindings = [user.id];
    if (status) {
      filters.push("status = ?");
      bindings.push(status);
    }
    const rows = await all(
      db,
      `SELECT * FROM tasks WHERE ${filters.join(" AND ")}
       ORDER BY status ASC, priority ASC, created_at DESC LIMIT 300`,
      ...bindings,
    );
    return json(rows.map(taskOut));
  }
  if (segments.length === 0 && method === "POST") {
    const body = await readJson(request);
    requireFields(body, ["title"]);
    const now = nowIso();
    const id = crypto.randomUUID();
    const task = {
      id,
      user_id: user.id,
      conversation_id: body.conversation_id || null,
      title: sanitizeText(body.title, 240).trim(),
      description: body.description ? sanitizeText(body.description, 5000) : null,
      priority: Math.min(5, Math.max(1, Number(body.priority || 3))),
      status: "pending",
      due_at: body.due_at || null,
      created_at: now,
      updated_at: now,
    };
    if (!task.title) throw new HttpError("validation_error", "Title is required", 422);
    if (task.conversation_id) {
      const conversation = await first(
        db,
        "SELECT id FROM conversations WHERE id = ? AND user_id = ?",
        task.conversation_id,
        user.id,
      );
      if (!conversation) throw new HttpError("not_found", "Conversation not found", 404);
    }
    await run(
      db,
      `INSERT INTO tasks
        (id, user_id, conversation_id, title, description, priority, status, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      task.id,
      task.user_id,
      task.conversation_id,
      task.title,
      task.description,
      task.priority,
      task.status,
      task.due_at,
      task.created_at,
      task.updated_at,
    );
    return json(taskOut(task), 201);
  }
  const id = segments[0];
  const task = await first(db, "SELECT * FROM tasks WHERE id = ? AND user_id = ?", id, user.id);
  if (!task) throw new HttpError("not_found", "Task not found", 404);
  if (method === "PATCH") {
    const body = await readJson(request);
    const updates = [];
    const bindings = [];
    for (const field of ["title", "description", "priority", "status", "due_at"]) {
      if (body[field] === undefined) continue;
      updates.push(`${field} = ?`);
      if (field === "priority") bindings.push(Math.min(5, Math.max(1, Number(body[field]))));
      else if (field === "title") bindings.push(sanitizeText(body[field], 240).trim());
      else if (field === "description") bindings.push(body[field] ? sanitizeText(body[field], 5000) : null);
      else bindings.push(body[field]);
    }
    if (updates.length) {
      updates.push("updated_at = ?");
      bindings.push(nowIso(), id, user.id);
      await run(db, `UPDATE tasks SET ${updates.join(", ")} WHERE id = ? AND user_id = ?`, ...bindings);
    }
    const updated = await first(db, "SELECT * FROM tasks WHERE id = ?", id);
    return json(taskOut(updated));
  }
  if (method === "DELETE") {
    await run(db, "DELETE FROM tasks WHERE id = ? AND user_id = ?", id, user.id);
    return new Response(null, { status: 204 });
  }
  return null;
}

async function handleSearch(request, env, db) {
  await requireUser(request, env, db);
  const body = await readJson(request);
  const query = sanitizeText(body.query, 400).trim();
  if (!query) throw new HttpError("validation_error", "Query is required", 422);
  const maxResults = Math.min(10, Math.max(1, Number(body.max_results || 5)));
  const results = await searchWeb(query, maxResults);
  return json({ query, provider: "duckduckgo", results, cached: false });
}

async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = parts(url);
  const method = request.method.toUpperCase();
  // D1 read replication can serve a stale replica for a request that follows
  // a write. Pin each request to the primary for its first query so
  // conversations created moments ago are always visible.
  const db =
    typeof env.DB?.withSession === "function" ? env.DB.withSession("first-primary") : env.DB;

  if (method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (path.length === 0) {
    return json(await health(env, db));
  }
  if (path[0] !== "api" || path[1] !== "v1") {
    throw new HttpError("not_found", "Not found", 404);
  }
  const rest = path.slice(2);

  if (rest[0] === "health") {
    if (rest.length === 1 && method === "GET") return json(await health(env, db));
    if (rest[1] === "providers" && method === "GET") return json(await providerReport(env));
    if (rest[1] === "ready" && method === "GET") {
      const payload = await ready(env, db);
      return json(payload, payload.database ? 200 : 503);
    }
  }

  if (rest[0] === "auth") {
    const response = await handleAuth(request, env, db, rest[1], method);
    if (response) return response;
  }

  if (rest[0] === "conversations") {
    const response = await handleConversations(request, env, db, rest.slice(1), method);
    if (response) return response;
  }

  if (rest[0] === "chat" && method === "POST") {
    return handleChat(request, env, db, rest[1] === "stream", ctx);
  }

  if (rest[0] === "settings" && (method === "GET" || method === "PATCH")) {
    return handleSettings(request, env, db, method);
  }

  if (rest[0] === "models" && method === "GET") {
    const user = await requireUser(request, env, db);
    return json({
      strategy: preferencesFor(user).routing_strategy,
      demo_mode: detectProviders(env).length === 0,
      models: settingsPayload(env, user).model_catalog,
      providers: settingsPayload(env, user).capabilities.providers,
    });
  }

  if (rest[0] === "memories") {
    const response = await handleMemories(request, env, db, rest.slice(1), method);
    if (response) return response;
  }

  if (rest[0] === "tasks") {
    const response = await handleTasks(request, env, db, rest.slice(1), method);
    if (response) return response;
  }

  if (rest[0] === "search" && method === "POST") {
    return handleSearch(request, env, db);
  }

  if (rest[0] === "voice" && rest[1] === "status" && method === "GET") {
    await requireUser(request, env, db);
    return json({
      stt: false,
      tts: false,
      stt_provider: null,
      tts_provider: null,
      browser_fallback: true,
    });
  }

  if (rest[0] === "files" && method === "GET") {
    await requireUser(request, env, db);
    return json({ items: [], total: 0 });
  }

  // The studio UI reads these lists on mount. The edge deployment does not
  // generate study sets or interview sessions yet, so return empty collections
  // instead of a 404 that would surface as an error toast.
  if (rest[0] === "study" && rest[1] === "sets" && method === "GET") {
    await requireUser(request, env, db);
    return json({ items: [], total: 0 });
  }

  if (rest[0] === "interview" && rest[1] === "sessions" && method === "GET") {
    await requireUser(request, env, db);
    return json({ items: [], total: 0 });
  }

  if (
    ["files", "code", "study", "interview", "voice"].includes(rest[0]) &&
    method !== "GET"
  ) {
    await requireUser(request, env, db);
    throw new HttpError(
      "not_implemented",
      `${rest[0]} is not available on the edge deployment yet.`,
      501,
    );
  }

  throw new HttpError("not_found", "Not found", 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await route(request, env, ctx);
      return withCors(response, env, request);
    } catch (error) {
      if (error instanceof HttpError) {
        return withCors(
          errorResponse(error.code, error.message, error.status, error.details),
          env,
          request,
        );
      }
      console.error("Unhandled edge API error", error);
      return withCors(
        errorResponse(
          "internal_error",
          "The edge API hit an unexpected error. Please try again.",
          500,
        ),
        env,
        request,
      );
    }
  },
};
