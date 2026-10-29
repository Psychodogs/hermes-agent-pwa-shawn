import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { withProjectNavigation } from "@/lib/project-sessions";
import type { Project, ProjectSession } from "@/lib/chat-types";

export const dynamic = "force-dynamic";
export default function TelegramLayout({ children }: { children: ReactNode }) {
  const projects = (db.prepare("SELECT * FROM projects WHERE archived = 0 ORDER BY pinned DESC, last_active_at DESC").all() as Omit<Project, "scheduled_session_id" | "unread_scheduled_count">[]).map(withProjectNavigation) as Project[];
  const sessions = db.prepare("SELECT ps.* FROM project_sessions ps JOIN projects p ON p.id = ps.project_id WHERE ps.archived = 0 AND p.archived = 0 ORDER BY ps.last_active_at DESC").all() as ProjectSession[];
  return <AppShell projects={projects} sessions={sessions} title="Telegram">{children}</AppShell>;
}
