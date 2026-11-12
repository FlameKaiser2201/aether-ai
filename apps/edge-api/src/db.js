export async function first(db, sql, ...bindings) {
  return db.prepare(sql).bind(...bindings).first();
}

export async function all(db, sql, ...bindings) {
  const result = await db.prepare(sql).bind(...bindings).all();
  return result.results || [];
}

export async function run(db, sql, ...bindings) {
  return db.prepare(sql).bind(...bindings).run();
}

export function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function conversationOut(row) {
  return {
    id: row.id,
    title: row.title,
    mode: row.mode,
    summary: row.summary ?? null,
    message_count: Number(row.message_count || 0),
    pinned: Boolean(row.pinned),
    archived: Boolean(row.archived),
    last_message_at: row.last_message_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function messageOut(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    provider: row.provider ?? null,
    model: row.model ?? null,
    citations: parseJson(row.citations, []),
    meta: parseJson(row.meta, {}),
    created_at: row.created_at,
  };
}

export function memoryOut(row) {
  return {
    id: row.id,
    category: row.category,
    key: row.key,
    value: row.value,
    confidence: Number(row.confidence || 0),
    source_conversation_id: row.source_conversation_id ?? null,
    last_used_at: row.last_used_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function taskOut(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    priority: Number(row.priority || 3),
    status: row.status,
    due_at: row.due_at ?? null,
    conversation_id: row.conversation_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
