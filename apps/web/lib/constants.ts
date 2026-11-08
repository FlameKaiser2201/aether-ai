import type { ChatMode } from "@/lib/types";

export const NAV_ITEMS = [
  { href: "/chat", label: "Chat", icon: "MessageSquare" },
  { href: "/voice", label: "Voice", icon: "AudioLines" },
  { href: "/studio", label: "Studio", icon: "Sparkles" },
  { href: "/history", label: "History", icon: "History" },
  { href: "/memory", label: "Memory", icon: "Brain" },
  { href: "/settings", label: "Settings", icon: "Settings2" },
] as const;

export const CHAT_MODES: Array<{ value: ChatMode; label: string; hint: string }> = [
  { value: "auto", label: "Auto", hint: "AETHER picks the right model and mode" },
  { value: "general", label: "General", hint: "Everyday questions and planning" },
  { value: "study", label: "Study", hint: "Notes, quizzes, flashcards and revision" },
  { value: "coding", label: "Code", hint: "Generate, review, debug and refactor" },
  { value: "interview", label: "Interview", hint: "Mock interviews and answer coaching" },
  { value: "research", label: "Research", hint: "Live web research with citations" },
  { value: "voice", label: "Voice", hint: "Short spoken-style responses" },
];

export const SUGGESTIONS = [
  {
    title: "Build my revision plan",
    body: "Create a 7-day active-recall plan for data structures, with daily checkpoints.",
    prompt: "Create a 7-day active-recall revision plan for data structures with daily checkpoints and practice questions.",
    icon: "GraduationCap",
  },
  {
    title: "Debug this traceback",
    body: "Paste a failing stack trace and get a root-cause explanation plus a fix.",
    prompt: "Help me debug a Python traceback. Ask for the code and the exact error, then explain the root cause and the minimal fix.",
    icon: "Bug",
  },
  {
    title: "Run a mock interview",
    body: "Practice a backend interview with structured scoring and feedback.",
    prompt: "Run a technical mock interview for a backend engineer role at a product company. Start with one question.",
    icon: "Mic",
  },
  {
    title: "Research with sources",
    body: "Search the public web, compare evidence and cite every material claim.",
    prompt: "Research the latest practical differences between PostgreSQL and SQLite for production AI apps. Cite sources.",
    icon: "Globe2",
  },
];

export const MEMORY_CATEGORIES = [
  "identity",
  "preference",
  "goal",
  "project",
  "skill",
  "relationship",
  "schedule",
  "fact",
] as const;

export const STUDY_KINDS = [
  { value: "notes", label: "Structured notes" },
  { value: "summary", label: "Summary" },
  { value: "questions", label: "Important questions" },
  { value: "quiz", label: "Practice quiz" },
  { value: "flashcards", label: "Flashcards" },
  { value: "revision_plan", label: "Revision plan" },
] as const;

export const LANGUAGES = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "sql", label: "SQL" },
  { value: "dart", label: "Dart" },
  { value: "kotlin", label: "Kotlin" },
  { value: "swift", label: "Swift" },
  { value: "ruby", label: "Ruby" },
] as const;

export const API_ERROR_FALLBACK = "Something went wrong. Please try again.";
