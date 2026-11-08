import type { Metadata } from "next";

import { StudioView } from "@/components/studio/studio-view";

export const metadata: Metadata = {
  title: "Studio",
  description:
    "Study, interview, code, research, file analysis and tasks in one focused AETHER workspace.",
};

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const params = await searchParams;
  const tab = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  return <StudioView defaultTab={tab} />;
}
