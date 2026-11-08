"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Code2,
  FolderUp,
  Globe2,
  ListChecks,
  Mic,
  Sparkles,
} from "lucide-react";

import { CodePanel } from "@/components/studio/code-panel";
import { FilesPanel } from "@/components/studio/files-panel";
import { InterviewPanel } from "@/components/studio/interview-panel";
import { ResearchPanel } from "@/components/studio/research-panel";
import { StudyPanel } from "@/components/studio/study-panel";
import { TasksPanel } from "@/components/studio/tasks-panel";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "study", label: "Study", icon: BookOpen },
  { value: "interview", label: "Interview", icon: Mic },
  { value: "code", label: "Code", icon: Code2 },
  { value: "research", label: "Research", icon: Globe2 },
  { value: "files", label: "Files", icon: FolderUp },
  { value: "tasks", label: "Tasks", icon: ListChecks },
] as const;

type StudioTab = (typeof TABS)[number]["value"];

function isStudioTab(value: string | undefined): value is StudioTab {
  return TABS.some((tab) => tab.value === value);
}

export function StudioView({ defaultTab }: { defaultTab?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<StudioTab>(
    isStudioTab(defaultTab) ? defaultTab : "study",
  );

  function changeTab(value: string) {
    if (!isStudioTab(value)) return;
    setTab(value);
    router.replace(`/studio?tab=${value}`, { scroll: false });
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300/80" /> Workspace
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Studio
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">
            Six focused workspaces for studying, interviews, code, research,
            documents and execution — all grounded in your account and memory.
          </p>
        </div>
        <Badge
          variant="outline"
          className="hidden gap-1.5 self-start border-cyan-400/15 bg-cyan-400/[0.04] text-cyan-200/80 sm:inline-flex"
        >
          <Sparkles className="h-3 w-3" /> Saved automatically
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={changeTab} className="mt-6">
        <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:px-0">
          <TabsList className="h-auto w-max min-w-full justify-start gap-1 p-1 sm:min-w-0">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  className="gap-1.5 px-3 py-2 text-[11px] sm:text-xs"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <TabsContent value="study">
          <StudyPanel />
        </TabsContent>
        <TabsContent value="interview">
          <InterviewPanel />
        </TabsContent>
        <TabsContent value="code">
          <CodePanel />
        </TabsContent>
        <TabsContent value="research">
          <ResearchPanel />
        </TabsContent>
        <TabsContent value="files">
          <FilesPanel />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
