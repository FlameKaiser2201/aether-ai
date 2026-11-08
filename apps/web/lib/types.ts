export type ChatMode = "auto" | "general" | "study" | "coding" | "interview" | "research" | "voice";

export interface UserPreferences {
  language: "auto" | "en" | "hi" | "hinglish";
  response_style: "concise" | "balanced" | "detailed";
  theme: "dark" | "system";
  auto_speak: boolean;
  continuous_listening: boolean;
  auto_memory: boolean;
  web_search_default: boolean;
  routing_strategy: "quality" | "cost" | "local";
  voice_name: string;
  voice_rate: number;
  voice_pitch: number;
  study_level: "beginner" | "intermediate" | "advanced" | "exam";
  interview_role: string;
  interview_company: string;
  timezone: string;
  code_language: string;
  show_routing: boolean;
  demo_banner_dismissed: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  auth_provider: string;
  email_verified: boolean;
  role: string;
  preferences: UserPreferences;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  mode: string;
  summary: string | null;
  message_count: number;
  pinned: boolean;
  archived: boolean;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  provider: string | null;
  model: string | null;
  citations: Citation[];
  meta: Record<string, unknown>;
  created_at: string;
  pending?: boolean;
}

export interface Citation {
  index: number;
  title: string;
  url: string;
  snippet: string;
}

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  line: number | null;
  column: number | null;
  rule: string;
  message: string;
  suggestion: string;
}

export interface ValidationReport {
  language: string;
  ok: boolean;
  issues: ValidationIssue[];
  stats: Record<string, number | string>;
  checked: string[];
}

export interface PlanStep {
  title: string;
  task_type: string;
  priority: number;
  status: string;
}

export interface ChatMeta {
  conversation_id: string;
  message_id: string | null;
  provider: string;
  model: string;
  tier: string;
  task_type: string;
  routing_reason: string;
  demo: boolean;
  plan: PlanStep[];
  mode: ChatMode;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  latency_ms?: number;
}

export interface ChatResponse {
  conversation: Conversation;
  message: Message;
  citations: Citation[];
  usage: Usage;
  plan: PlanStep[];
  validation: { blocks: ValidationReport[] } | null;
  meta: ChatMeta;
}

export interface ConversationDetail extends Conversation {
  messages: Message[];
}

export interface ConversationList {
  items: Conversation[];
  total: number;
  limit: number;
  offset: number;
}

export interface Memory {
  id: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  source_conversation_id: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemoryList {
  items: Memory[];
  total: number;
  categories: Record<string, number>;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: number;
  status: "pending" | "in_progress" | "done" | "cancelled";
  due_at: string | null;
  conversation_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FileRecord {
  id: string;
  conversation_id: string | null;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_backend: string;
  page_count: number;
  status: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface FileList {
  items: FileRecord[];
  total: number;
}

export interface AnalyzeResponse {
  file_id: string;
  mode: string;
  content: string;
  data: unknown;
  provider: string;
  model: string;
}

export type StudyKind = "notes" | "summary" | "questions" | "quiz" | "flashcards" | "revision_plan";

export interface StudySet {
  id: string;
  kind: StudyKind;
  topic: string;
  level: string;
  content: Record<string, unknown>;
  created_at: string;
}

export interface StudySetList {
  items: StudySet[];
  total: number;
}

export interface InterviewQuestion {
  index: number;
  question: string;
  category: string;
  difficulty: string;
  hint: string;
  answer_guide: string;
  role?: string;
  company?: string;
}

export interface InterviewSession {
  id: string;
  role: string;
  company: string;
  type: string;
  difficulty: string;
  status: string;
  questions: InterviewQuestion[];
  score: number | null;
  feedback: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

export interface InterviewSessionList {
  items: InterviewSession[];
  total: number;
}

export interface InterviewEvaluation {
  question_index: number;
  score: number;
  rubric: Record<string, number>;
  strengths: string[];
  improvements: string[];
  model_answer: string;
  next_question: InterviewQuestion | null;
}

export interface InterviewReport {
  session_id: string;
  score: number;
  overall: string;
  strengths: string[];
  gaps: string[];
  next_steps: string[];
  per_question: Array<{
    index: number;
    question: string;
    score: number;
    feedback: Record<string, unknown>;
  }>;
}

export interface CodeActionResponse {
  result: string;
  code: string | null;
  validation: ValidationReport;
  provider: string;
  model: string;
}

export interface SearchResultItem {
  index: number;
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  provider: string;
  results: SearchResultItem[];
  cached: boolean;
}

export interface VoiceStatus {
  stt: boolean;
  tts: boolean;
  stt_provider: string | null;
  tts_provider: string | null;
  browser_fallback: boolean;
}

export interface ModelOption {
  tier: string;
  provider: string;
  model: string;
  available: boolean;
}

export interface ProviderAvailability {
  chat: boolean;
  streaming: boolean;
  embeddings: boolean;
  vision: boolean;
  stt: boolean;
  tts: boolean;
  demo: boolean;
}

export interface SettingsPayload {
  preferences: UserPreferences;
  capabilities: {
    providers: Record<string, ProviderAvailability>;
    demo_mode: boolean;
    web_search: boolean;
    storage: string;
    redis: boolean;
  };
  routing_strategy: string;
  model_catalog: ModelOption[];
  limits: Record<string, number>;
}

export interface ModelCatalog {
  strategy: string;
  demo_mode: boolean;
  models: ModelOption[];
  providers: Record<string, ProviderAvailability>;
}

export interface StreamMeta extends ChatMeta {
  conversation_id: string;
}
