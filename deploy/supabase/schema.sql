-- =============================================================================
-- AETHER — Supabase Free PostgreSQL schema
-- =============================================================================
-- Mirrors Alembic revision 40481f84bf69 (the only migration in this repo).
--
-- Run this once in the Supabase SQL editor for a fresh project. It is
-- idempotent, so it is also safe to run after the API container has applied
-- Alembic migrations: the CREATE statements become no-ops and the ALTER
-- statements enable row-level security.
--
-- The API connects as the Supabase `postgres` role through the session pooler.
-- That role bypasses RLS, so AETHER keeps working while the public PostgREST
-- roles (anon/authenticated) have no policies and therefore no table access.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table if not exists users (
    id varchar(36) primary key,
    email varchar(320) not null,
    password_hash varchar(255),
    name varchar(120) not null,
    avatar_url varchar(1024),
    auth_provider varchar(32) not null,
    email_verified boolean not null,
    is_active boolean not null,
    role varchar(24) not null,
    preferences jsonb not null,
    last_login_at timestamptz,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
);
create unique index if not exists ix_users_email on users (email);

-- ---------------------------------------------------------------------------
-- conversations
-- ---------------------------------------------------------------------------
create table if not exists conversations (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    title varchar(160) not null,
    mode varchar(24) not null,
    summary text,
    message_count integer not null,
    pinned boolean not null,
    archived boolean not null,
    last_message_at timestamptz,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
);
create index if not exists ix_conversations_user_id on conversations (user_id);
create index if not exists ix_conversations_user_updated
    on conversations (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- interview_sessions
-- ---------------------------------------------------------------------------
create table if not exists interview_sessions (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    role varchar(120) not null,
    company varchar(120) not null,
    type varchar(32) not null,
    difficulty varchar(24) not null,
    status varchar(24) not null,
    questions jsonb not null,
    score double precision,
    feedback jsonb not null,
    created_at timestamptz not null default current_timestamp,
    completed_at timestamptz
);
create index if not exists ix_interview_sessions_user_id
    on interview_sessions (user_id);

-- ---------------------------------------------------------------------------
-- memories
-- ---------------------------------------------------------------------------
create table if not exists memories (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    category varchar(32) not null,
    key varchar(160) not null,
    value text not null,
    confidence double precision not null,
    source_conversation_id varchar(36),
    embedding jsonb,
    last_used_at timestamptz,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp,
    constraint uq_memory_user_category_key unique (user_id, category, key)
);
create index if not exists ix_memories_user_id on memories (user_id);
create index if not exists ix_memories_user_category on memories (user_id, category);

-- ---------------------------------------------------------------------------
-- refresh_tokens
-- ---------------------------------------------------------------------------
create table if not exists refresh_tokens (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    token_hash varchar(64) not null,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    replaced_by varchar(64),
    user_agent varchar(512),
    ip_address varchar(64),
    created_at timestamptz not null default current_timestamp
);
create unique index if not exists ix_refresh_tokens_token_hash
    on refresh_tokens (token_hash);
create index if not exists ix_refresh_tokens_user_id on refresh_tokens (user_id);

-- ---------------------------------------------------------------------------
-- study_sets
-- ---------------------------------------------------------------------------
create table if not exists study_sets (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    kind varchar(32) not null,
    topic varchar(240) not null,
    level varchar(32) not null,
    content jsonb not null,
    created_at timestamptz not null default current_timestamp
);
create index if not exists ix_study_sets_user_id on study_sets (user_id);
create index if not exists ix_study_sets_created_at on study_sets (created_at);

-- ---------------------------------------------------------------------------
-- usage_logs
-- ---------------------------------------------------------------------------
create table if not exists usage_logs (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    provider varchar(48) not null,
    model varchar(120) not null,
    task_type varchar(32) not null,
    input_tokens integer not null,
    output_tokens integer not null,
    latency_ms integer not null,
    created_at timestamptz not null default current_timestamp
);
create index if not exists ix_usage_logs_user_id on usage_logs (user_id);
create index if not exists ix_usage_logs_created_at on usage_logs (created_at);

-- ---------------------------------------------------------------------------
-- files
-- ---------------------------------------------------------------------------
create table if not exists files (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    conversation_id varchar(36) references conversations (id) on delete set null,
    filename varchar(255) not null,
    original_name varchar(255) not null,
    mime_type varchar(160) not null,
    size_bytes integer not null,
    storage_backend varchar(24) not null,
    storage_key varchar(512) not null,
    extracted_text text not null,
    page_count integer not null,
    status varchar(24) not null,
    meta jsonb not null,
    created_at timestamptz not null default current_timestamp
);
create index if not exists ix_files_user_id on files (user_id);
create index if not exists ix_files_conversation_id on files (conversation_id);

-- ---------------------------------------------------------------------------
-- interview_turns
-- ---------------------------------------------------------------------------
create table if not exists interview_turns (
    id varchar(36) primary key,
    session_id varchar(36) not null references interview_sessions (id) on delete cascade,
    user_id varchar(36) not null,
    question_index integer not null,
    question text not null,
    answer text not null,
    evaluation jsonb not null,
    score double precision not null,
    created_at timestamptz not null default current_timestamp
);
create index if not exists ix_interview_turns_session_id
    on interview_turns (session_id);
create index if not exists ix_interview_turns_user_id on interview_turns (user_id);

-- ---------------------------------------------------------------------------
-- messages
-- ---------------------------------------------------------------------------
create table if not exists messages (
    id varchar(36) primary key,
    conversation_id varchar(36) not null references conversations (id) on delete cascade,
    role varchar(16) not null,
    content text not null,
    provider varchar(48),
    model varchar(120),
    input_tokens integer not null,
    output_tokens integer not null,
    latency_ms integer not null,
    citations jsonb not null,
    meta jsonb not null,
    created_at timestamptz not null default current_timestamp
);
create index if not exists ix_messages_conversation_id on messages (conversation_id);
create index if not exists ix_messages_created_at on messages (created_at);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table if not exists tasks (
    id varchar(36) primary key,
    user_id varchar(36) not null references users (id) on delete cascade,
    conversation_id varchar(36) references conversations (id) on delete set null,
    title varchar(240) not null,
    description text,
    priority integer not null,
    status varchar(24) not null,
    due_at timestamptz,
    created_at timestamptz not null default current_timestamp,
    updated_at timestamptz not null default current_timestamp
);
create index if not exists ix_tasks_user_id on tasks (user_id);
create index if not exists ix_tasks_user_status_priority
    on tasks (user_id, status, priority);

-- ---------------------------------------------------------------------------
-- document_chunks
-- ---------------------------------------------------------------------------
create table if not exists document_chunks (
    id varchar(36) primary key,
    file_id varchar(36) not null references files (id) on delete cascade,
    user_id varchar(36) not null,
    chunk_index integer not null,
    content text not null,
    token_count integer not null,
    meta jsonb not null
);
create index if not exists ix_document_chunks_file_id on document_chunks (file_id);
create index if not exists ix_document_chunks_user_id on document_chunks (user_id);

-- ---------------------------------------------------------------------------
-- Alembic bookkeeping
-- ---------------------------------------------------------------------------
-- Stamp the initial revision so the API container's automatic
-- `alembic upgrade head` is a no-op on a database created from this file.
create table if not exists alembic_version (
    version_num varchar(32) not null,
    constraint alembic_version_pkc primary key (version_num)
);
insert into alembic_version (version_num)
values ('40481f84bf69')
on conflict (version_num) do nothing;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
-- AETHER never exposes these tables through Supabase's public anon key. RLS
-- with no policies blocks PostgREST access; the API's postgres role bypasses it.
alter table users enable row level security;
alter table conversations enable row level security;
alter table interview_sessions enable row level security;
alter table memories enable row level security;
alter table refresh_tokens enable row level security;
alter table study_sets enable row level security;
alter table usage_logs enable row level security;
alter table files enable row level security;
alter table interview_turns enable row level security;
alter table messages enable row level security;
alter table tasks enable row level security;
alter table document_chunks enable row level security;

-- ---------------------------------------------------------------------------
-- Storage bucket (optional)
-- ---------------------------------------------------------------------------
-- You can also create this from Storage → New bucket in the dashboard.
-- Keep it private: only the API's service-role key reads/writes it.
insert into storage.buckets (id, name, public)
values ('aether-files', 'aether-files', false)
on conflict (id) do nothing;

commit;
