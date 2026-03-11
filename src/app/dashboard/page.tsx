import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { CalendarPanel } from "@/components/CalendarPanel";
import { GmailPanel } from "@/components/GmailPanel";
import { ActionItemsPanel } from "@/components/ActionItemsPanel";
import { TranscriptionsPanel } from "@/components/TranscriptionsPanel";
import { FileBrowser } from "@/components/FileBrowser";
import { PagesPanel } from "@/components/PagesPanel";
import { AgentPanel } from "@/components/AgentPanel";
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const params = searchParams ? await searchParams : {};
  const tab = typeof params.tab === "string" ? params.tab : undefined;

  let content: ReactNode;
  switch (tab) {
    case "agent":
      content = <AgentPanel embedded />;
      break;
    case "calendar":
      content = <CalendarPanel />;
      break;
    case "gmail":
      content = <GmailPanel />;
      break;
    case "actions":
      content = <ActionItemsPanel />;
      break;
    case "transcriptions":
      content = <TranscriptionsPanel />;
      break;
    case "files":
      content = <FileBrowser />;
      break;
    case "pages":
      content = <PagesPanel />;
      break;
    default:
      content = (
        <DashboardHome
          user={session.user}
          userKey={
            (session.userId as string) || session.user.email || "workspace"
          }
          accessToken={(session.accessToken as string) || ""}
          refreshToken={session.refreshToken as string | undefined}
          grantedScopes={session.grantedScopes}
        />
      );
  }

  return (
    <DashboardShell user={session.user} currentTab={tab}>
      {content}
    </DashboardShell>
  );
}
