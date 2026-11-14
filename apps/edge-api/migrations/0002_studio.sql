-- Study artifacts and mock-interview sessions for the edge API.

CREATE TABLE IF NOT EXISTS study_sets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  topic TEXT NOT NULL,
  level TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_study_user ON study_sets(user_id, created_at);

CREATE TABLE IF NOT EXISTS interview_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  company TEXT NOT NULL,
  type TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  questions TEXT NOT NULL DEFAULT '[]',
  score REAL,
  feedback TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_interview_user ON interview_sessions(user_id, created_at);

CREATE TABLE IF NOT EXISTS interview_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question_index INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  evaluation TEXT NOT NULL DEFAULT '{}',
  score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (session_id, question_index)
);
CREATE INDEX IF NOT EXISTS idx_interview_turns_session
  ON interview_turns(session_id, question_index);
