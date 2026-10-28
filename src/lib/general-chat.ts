import { db } from "./db";

/* The General chat: where every scheduled job reports.
 *
 * Hermes delivers cron output into one ongoing conversation — a Telegram home
 * channel, or a profile's Bot Chat (`deliver: bot-chat`, cron/scheduler_delivery.py
 * on upstream main) — and you reply in that same conversation. Neither lane
 * can reach this app, so the watcher reads the output file instead, but the
 * shape is the same: one chat for the whole install, not an inbox per project
 * and a new thread per reply.
 *
 * General is an ordinary project with exactly one session. It is named by an
 * app_settings row rather than by its title, so renaming it doesn't lose it.
 *
 * Lookups only, and nothing beyond the database handle: project-sessions.ts
 * reads these, and general-chat-setup.ts — which creates General when it is
 * missing — imports project-sessions.ts. */

export const GENERAL_NAME = "General";
export const GENERAL_PROJECT_KEY = "general_project_id";

export interface GeneralChat {
  projectId: string;
  sessionId: string;
}

export interface GeneralSessionRow {
  session_id: string;
  archived: number;
}

/** General's project id, if it has been chosen and still exists. */
export function generalProjectId(): string | null {
  const row = db
    .prepare(
      `SELECT p.id FROM app_settings s JOIN projects p ON p.id = s.value
        WHERE s.key = ?`,
    )
    .get(GENERAL_PROJECT_KEY) as { id: string } | undefined;
  return row?.id ?? null;
}

export function isGeneralProject(projectId: string): boolean {
  return generalProjectId() === projectId;
}

/**
 * The one session General keeps. It is chosen in this order: the Bot Chat
 * (when General is a Bot's project, that chat is the Bot's and cannot go),
 * then the most recently active root chat that is not a reply-discussion
 * spawned by the retired Scheduled inbox. Branches and discussions are
 * exactly what the migration deletes, so the survivor is never one of them.
 * An archived chat still qualifies, after any live one: ensureGeneralChat()
 * unarchives it rather than starting a second chat beside it.
 */
export function generalSurvivor(projectId: string): GeneralSessionRow | null {
  const botChat = db
    .prepare(
      `SELECT session_id, archived FROM project_sessions
        WHERE project_id = ? AND bot_chat = 1
        ORDER BY archived ASC, last_active_at DESC LIMIT 1`,
    )
    .get(projectId) as GeneralSessionRow | undefined;
  if (botChat) return botChat;
  return (
    (db
      .prepare(
        `SELECT session_id, archived FROM project_sessions
          WHERE project_id = ? AND kind = 'chat' AND parent_session_id IS NULL
            AND retired_at IS NULL
            AND session_id NOT IN (SELECT session_id FROM cron_discussions)
          ORDER BY archived ASC, last_active_at DESC, created_at DESC LIMIT 1`,
      )
      .get(projectId) as GeneralSessionRow | undefined) ?? null
  );
}

/** Where reports land now, without creating anything. */
export function generalChat(): GeneralChat | null {
  const projectId = generalProjectId();
  if (!projectId) return null;
  const survivor = generalSurvivor(projectId);
  return survivor ? { projectId, sessionId: survivor.session_id } : null;
}

/**
 * The 409 for anything that would give General a second chat — new chat,
 * `/new`, branch. Null for every other project.
 */
export function generalSingleChatRefusal(projectId: string): Response | null {
  if (!isGeneralProject(projectId)) return null;
  return Response.json(
    {
      error: `${GENERAL_NAME} is the one chat scheduled jobs report into, so it keeps a single conversation`,
      code: "general_single_chat",
    },
    { status: 409 },
  );
}
