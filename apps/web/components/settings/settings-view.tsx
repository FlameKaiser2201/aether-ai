"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  AudioLines,
  Brain,
  Check,
  CheckCircle2,
  Cpu,
  Database,
  Gauge,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  Minus,
  Play,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { endSession } from "@/lib/auth-client";
import { api, errorMessage } from "@/lib/api";
import { LANGUAGES } from "@/lib/constants";
import {
  browserSupportsSpeech,
  getSpeechRecognition,
  listVoices,
  speakText,
  stopSpeaking,
} from "@/lib/speech";
import { cn, initials } from "@/lib/utils";
import type {
  ProviderAvailability,
  SettingsPayload,
  UserPreferences,
} from "@/lib/types";

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.06] py-4 first:pt-0 last:border-b-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="max-w-lg">
        <p className="text-[13px] font-medium text-slate-200">{title}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
          {description}
        </p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

const PROVIDER_FEATURES: Array<[keyof ProviderAvailability, string]> = [
  ["chat", "Chat"],
  ["streaming", "Stream"],
  ["vision", "Vision"],
  ["stt", "STT"],
  ["tts", "TTS"],
  ["embeddings", "Embeddings"],
];

export function SettingsView() {
  const { data: session, update } = useSession();
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [testingVoice, setTestingVoice] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<SettingsPayload>("settings");
        if (cancelled) return;
        setSettings(data);
        setPreferences(data.preferences);
      } catch (error) {
        if (!cancelled) toast.error(errorMessage(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (session?.user?.name) setName(session.user.name);
  }, [session?.user?.name]);

  useEffect(() => {
    if (!browserSupportsSpeech()) return;
    const refresh = () => setVoices(listVoices());
    refresh();
    window.speechSynthesis.onvoiceschanged = refresh;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function setPref<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) {
    setPreferences((previous) =>
      previous ? { ...previous, [key]: value } : previous,
    );
  }

  async function savePreferences() {
    if (!preferences) return;
    setSavingPreferences(true);
    try {
      const result = await api<{ preferences: UserPreferences }>("settings", {
        method: "PATCH",
        body: JSON.stringify(preferences),
      });
      setPreferences(result.preferences);
      setSettings((previous) =>
        previous ? { ...previous, preferences: result.preferences } : previous,
      );
      await update({ preferences: result.preferences });
      toast.success("Preferences saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingPreferences(false);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("Your name cannot be blank.");
      return;
    }
    setSavingProfile(true);
    try {
      await api("auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      await update({ name: name.trim() });
      toast.success("Profile updated");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  }

  async function testVoice() {
    if (!preferences) return;
    if (!browserSupportsSpeech()) {
      toast.error("This browser does not support speech synthesis.");
      return;
    }
    setTestingVoice(true);
    try {
      await speakText(
        "Hi, I'm AETHER. This is how your voice assistant will sound.",
        {
          voiceName:
            preferences.voice_name !== "auto"
              ? preferences.voice_name
              : undefined,
          rate: preferences.voice_rate,
          pitch: preferences.voice_pitch,
        },
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTestingVoice(false);
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("The new passwords do not match.");
      return;
    }
    if (newPassword.length < 10) {
      toast.error("Use at least 10 characters for the new password.");
      return;
    }
    setChangingPassword(true);
    try {
      await api("auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setChangingPassword(false);
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "DELETE") return;
    setDeleting(true);
    try {
      await api("auth/me", { method: "DELETE" });
      await endSession();
    } catch (error) {
      toast.error(errorMessage(error));
      setDeleting(false);
    }
  }

  if (loading || !preferences) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
    );
  }

  const capabilities = settings?.capabilities;
  const providerEntries = capabilities
    ? Object.entries(capabilities.providers)
    : [];
  const profileName = session?.user?.name ?? name;
  const speechRecognitionAvailable = Boolean(getSpeechRecognition());

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
          <Sparkles className="h-3.5 w-3.5 text-cyan-300/80" /> Workspace
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Settings
        </h1>
        <p className="mt-1.5 max-w-xl text-sm leading-6 text-slate-500">
          Control how AETHER thinks, speaks, remembers and protects your data.
        </p>
      </div>

      {capabilities?.demo_mode ? (
        <div className="mt-5 flex items-start gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[0.04] px-3.5 py-3 text-[11px] leading-5 text-amber-100/80">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Demo mode is active. AETHER runs without external provider keys and
            returns clearly-labelled illustrative answers. Configure a provider
            on the API to unlock live models.
          </span>
        </div>
      ) : null}

      <Tabs defaultValue="profile" className="mt-6">
        <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto p-1 no-scrollbar">
          <TabsTrigger value="profile">
            <UserRound className="h-3.5 w-3.5" /> Profile
          </TabsTrigger>
          <TabsTrigger value="assistant">
            <Sparkles className="h-3.5 w-3.5" /> Assistant
          </TabsTrigger>
          <TabsTrigger value="voice">
            <AudioLines className="h-3.5 w-3.5" /> Voice
          </TabsTrigger>
          <TabsTrigger value="privacy">
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy
          </TabsTrigger>
          <TabsTrigger value="system">
            <Server className="h-3.5 w-3.5" /> System
          </TabsTrigger>
          <TabsTrigger value="account">
            <Lock className="h-3.5 w-3.5" /> Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Your profile</CardTitle>
              <CardDescription>
                How AETHER addresses you across conversations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveProfile} className="space-y-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-400/20 to-violet-500/20 font-display text-xl font-semibold text-cyan-100">
                    {initials(profileName)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {profileName || "AETHER user"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {session?.user?.email ?? "Signed in"}
                    </p>
                    <Badge variant="success" className="mt-1.5 px-2 py-0 text-[9px]">
                      <CheckCircle2 className="h-2.5 w-2.5" /> verified session
                    </Badge>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="profile-name">Display name</Label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={80}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profile-email">Email</Label>
                    <Input
                      id="profile-email"
                      value={session?.user?.email ?? ""}
                      readOnly
                      className="text-slate-500"
                    />
                  </div>
                </div>
                <div className="space-y-2 sm:max-w-xs">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input
                    id="timezone"
                    value={preferences.timezone}
                    onChange={(event) => setPref("timezone", event.target.value)}
                    maxLength={64}
                    placeholder="UTC"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="aurora" disabled={savingProfile}>
                    {savingProfile ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save profile
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assistant">
          <Card>
            <CardHeader>
              <CardTitle>Assistant behaviour</CardTitle>
              <CardDescription>
                Defaults for routing, language and study or interview sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="language">Reply language</Label>
                  <Select
                    id="language"
                    value={preferences.language}
                    onChange={(event) =>
                      setPref(
                        "language",
                        event.target.value as UserPreferences["language"],
                      )
                    }
                  >
                    <option value="auto">Auto-detect</option>
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="hinglish">Hinglish</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="response-style">Response style</Label>
                  <Select
                    id="response-style"
                    value={preferences.response_style}
                    onChange={(event) =>
                      setPref(
                        "response_style",
                        event.target
                          .value as UserPreferences["response_style"],
                      )
                    }
                  >
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="routing-strategy">Routing strategy</Label>
                  <Select
                    id="routing-strategy"
                    value={preferences.routing_strategy}
                    onChange={(event) =>
                      setPref(
                        "routing_strategy",
                        event.target
                          .value as UserPreferences["routing_strategy"],
                      )
                    }
                  >
                    <option value="quality">Best quality</option>
                    <option value="cost">Lowest cost</option>
                    <option value="local">Local-first</option>
                  </Select>
                  <p className="text-[10px] leading-4 text-slate-600">
                    Quality prefers reasoning models. Cost prefers fast models.
                    Local prefers Ollama.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="study-level">Default study level</Label>
                  <Select
                    id="study-level"
                    value={preferences.study_level}
                    onChange={(event) =>
                      setPref(
                        "study_level",
                        event.target.value as UserPreferences["study_level"],
                      )
                    }
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                    <option value="exam">Exam-focused</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code-language">Default code language</Label>
                  <Select
                    id="code-language"
                    value={preferences.code_language}
                    onChange={(event) =>
                      setPref("code_language", event.target.value)
                    }
                  >
                    {LANGUAGES.map((language) => (
                      <option key={language.value} value={language.value}>
                        {language.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interview-role">Default interview role</Label>
                  <Input
                    id="interview-role"
                    value={preferences.interview_role}
                    onChange={(event) =>
                      setPref("interview_role", event.target.value)
                    }
                    placeholder="e.g. Backend Engineer"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interview-company">Default company</Label>
                  <Input
                    id="interview-company"
                    value={preferences.interview_company}
                    onChange={(event) =>
                      setPref("interview_company", event.target.value)
                    }
                    placeholder="e.g. General"
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="mt-6">
                <SettingRow
                  title="Show routing details"
                  description="Display the provider, model and reason behind each answer."
                >
                  <Switch
                    checked={preferences.show_routing}
                    onCheckedChange={(value) => setPref("show_routing", value)}
                  />
                </SettingRow>
              </div>

              <div className="mt-5 flex justify-end">
                <Button
                  variant="aurora"
                  onClick={() => void savePreferences()}
                  disabled={savingPreferences}
                >
                  {savingPreferences ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save preferences
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voice">
          <Card>
            <CardHeader>
              <CardTitle>Voice &amp; speech</CardTitle>
              <CardDescription>
                Tune the spoken experience. Browser speech is used when
                available, with a server provider as fallback.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow
                title="Speak answers automatically"
                description="Read responses aloud as they stream in voice mode."
              >
                <Switch
                  checked={preferences.auto_speak}
                  onCheckedChange={(value) => setPref("auto_speak", value)}
                />
              </SettingRow>
              <SettingRow
                title="Continuous listening"
                description={
                  speechRecognitionAvailable
                    ? "Restart the microphone after each answer for hands-free conversation."
                    : "Continuous listening needs browser speech recognition."
                }
              >
                <Switch
                  checked={preferences.continuous_listening}
                  onCheckedChange={(value) =>
                    setPref("continuous_listening", value)
                  }
                  disabled={!speechRecognitionAvailable}
                />
              </SettingRow>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="voice-name">Voice</Label>
                  <Select
                    id="voice-name"
                    value={preferences.voice_name}
                    onChange={(event) =>
                      setPref("voice_name", event.target.value)
                    }
                  >
                    <option value="auto">Auto-select</option>
                    {voices.map((voice) => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </Select>
                  {!voices.length ? (
                    <p className="text-[10px] text-slate-600">
                      Voice list loads once the browser exposes its speech
                      engine.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice-rate">
                    Speaking rate · {preferences.voice_rate.toFixed(2)}×
                  </Label>
                  <input
                    id="voice-rate"
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={preferences.voice_rate}
                    onChange={(event) =>
                      setPref("voice_rate", Number(event.target.value))
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voice-pitch">
                    Pitch · {preferences.voice_pitch.toFixed(2)}
                  </Label>
                  <input
                    id="voice-pitch"
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={preferences.voice_pitch}
                    onChange={(event) =>
                      setPref("voice_pitch", Number(event.target.value))
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => void testVoice()}
                    disabled={testingVoice}
                    className="w-full"
                  >
                    {testingVoice ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Test voice
                  </Button>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => stopSpeaking()}
                  className="text-slate-400"
                >
                  <Volume2 className="h-4 w-4" /> Stop speaking
                </Button>
                <Button
                  variant="aurora"
                  onClick={() => void savePreferences()}
                  disabled={savingPreferences}
                >
                  {savingPreferences ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save voice settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="privacy">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Memory &amp; research</CardTitle>
                <CardDescription>
                  Decide what AETHER may store and when it searches the web.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SettingRow
                  title="Automatic long-term memory"
                  description="Extract durable preferences and goals after conversations. You can edit or erase everything."
                >
                  <Switch
                    checked={preferences.auto_memory}
                    onCheckedChange={(value) => setPref("auto_memory", value)}
                  />
                </SettingRow>
                <SettingRow
                  title="Use web search by default"
                  description="Research mode always searches. This toggle makes search the default for every chat."
                >
                  <Switch
                    checked={preferences.web_search_default}
                    onCheckedChange={(value) =>
                      setPref("web_search_default", value)
                    }
                  />
                </SettingRow>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href="/memory">
                      <Brain className="h-3.5 w-3.5" /> Manage memory
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/history">
                      <Database className="h-3.5 w-3.5" /> Conversation history
                    </Link>
                  </Button>
                </div>
                <div className="mt-5 flex justify-end">
                  <Button
                    variant="aurora"
                    onClick={() => void savePreferences()}
                    disabled={savingPreferences}
                  >
                    {savingPreferences ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save privacy settings
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-400/10 bg-emerald-400/[0.02]">
              <CardContent className="flex items-start gap-3 p-5">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300/80" />
                <div>
                  <p className="text-[13px] font-medium text-emerald-100/90">
                    Security posture
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">
                    Passwords are hashed with Argon2. Sessions use rotating
                    refresh tokens. Provider keys never reach the browser. All
                    endpoints validate input, sanitize output and enforce rate
                    limits.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="system">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Providers</CardTitle>
                <CardDescription>
                  Detected capabilities from the API configuration.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {providerEntries.length ? (
                  providerEntries.map(([name, availability]) => (
                    <div
                      key={name}
                      className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="h-3.5 w-3.5 text-cyan-300/80" />
                          <span className="text-xs font-medium capitalize text-slate-200">
                            {name}
                          </span>
                          {availability.demo ? (
                            <Badge variant="warning" className="px-1.5 py-0 text-[9px]">
                              demo
                            </Badge>
                          ) : null}
                        </div>
                        <span className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
                          provider
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {PROVIDER_FEATURES.map(([key, label]) => (
                          <span
                            key={key}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px]",
                              availability[key]
                                ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
                                : "border-white/[0.06] bg-white/[0.015] text-slate-600",
                            )}
                          >
                            {availability[key] ? (
                              <Check className="h-2.5 w-2.5" />
                            ) : (
                              <Minus className="h-2.5 w-2.5" />
                            )}
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500">
                    No provider metadata is available.
                  </p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                      Storage
                    </p>
                    <p className="mt-1 text-xs text-slate-200">
                      {capabilities?.storage ?? "local"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
                      Redis cache
                    </p>
                    <p className="mt-1 text-xs text-slate-200">
                      {capabilities?.redis ? "connected" : "in-process fallback"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Model catalog</CardTitle>
                <CardDescription>
                  Tiers AETHER can route to, based on configured keys.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr className="border-b border-white/[0.07] text-[9px] uppercase tracking-[0.14em] text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Tier</th>
                        <th className="pb-2 pr-3 font-medium">Provider</th>
                        <th className="pb-2 pr-3 font-medium">Model</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(settings?.model_catalog ?? []).map((model) => (
                        <tr
                          key={`${model.tier}-${model.provider}-${model.model}`}
                          className="border-b border-white/[0.04] last:border-0"
                        >
                          <td className="py-2 pr-3 capitalize text-slate-300">
                            {model.tier}
                          </td>
                          <td className="py-2 pr-3 text-slate-400">
                            {model.provider}
                          </td>
                          <td className="py-2 pr-3 font-mono text-[10px] text-slate-400">
                            {model.model}
                          </td>
                          <td className="py-2">
                            <Badge
                              variant={model.available ? "success" : "outline"}
                              className="px-1.5 py-0 text-[9px]"
                            >
                              {model.available ? "available" : "not configured"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {settings?.limits
                    ? Object.entries(settings.limits).map(([key, value]) => (
                        <div
                          key={key}
                          className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                        >
                          <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                            {key.replaceAll("_", " ")}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-300">
                            {value.toLocaleString()}
                          </p>
                        </div>
                      ))
                    : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Demo banner</CardTitle>
                <CardDescription>
                  Control the demo-mode notice shown in chat.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SettingRow
                  title="Show demo banner"
                  description="Display a reminder when AETHER is running without external model keys."
                >
                  <Switch
                    checked={!preferences.demo_banner_dismissed}
                    onCheckedChange={(value) =>
                      setPref("demo_banner_dismissed", !value)
                    }
                  />
                </SettingRow>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant="aurora"
                    onClick={() => void savePreferences()}
                    disabled={savingPreferences}
                  >
                    {savingPreferences ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="account">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Change password</CardTitle>
                <CardDescription>
                  Use a unique password with at least 10 characters, including
                  upper, lower and numeric characters.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={changePassword} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        autoComplete="current-password"
                        value={currentPassword}
                        onChange={(event) =>
                          setCurrentPassword(event.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New password</Label>
                      <Input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        minLength={10}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm new</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        minLength={10}
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={changingPassword}
                    >
                      {changingPassword ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      Update password
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
                <div>
                  <p className="text-[13px] font-medium text-slate-200">
                    Sign out everywhere
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Revoke the current refresh token and clear this session.
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => void endSession()}
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </CardContent>
            </Card>

            <Card className="border-rose-400/10 bg-rose-400/[0.02]">
              <CardHeader>
                <CardTitle className="text-rose-100/90">Delete account</CardTitle>
                <CardDescription>
                  Permanently remove your account, conversations, memories,
                  files, study sets and interview sessions. This cannot be
                  undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-end">
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDeleteConfirm("");
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" /> Delete my account
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <Gauge className="h-3.5 w-3.5 text-cyan-300/70" />
          AETHER · Adaptive Engine for Thought, Help, Execution &amp; Research
        </div>
        <Link
          href="/chat"
          className="inline-flex items-center gap-1 text-[10px] text-cyan-300/80 hover:text-cyan-200"
        >
          Back to workspace <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account permanently?</DialogTitle>
            <DialogDescription>
              This removes everything associated with your account. Type{" "}
              <span className="font-mono text-rose-200">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder="Type DELETE"
            aria-label="Type DELETE to confirm"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void deleteAccount()}
              disabled={deleting || deleteConfirm !== "DELETE"}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
