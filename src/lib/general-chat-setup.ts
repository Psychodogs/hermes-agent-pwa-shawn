import { publishChange } from "./api-changes";
import { readSetting, writeSetting } from "./app-settings";
import { db } from "./db";
import {
  GENERAL_NAME,
  GENERAL_PROJECT_KEY,
  generalProjectId,
  generalSurvivor,
  type GeneralChat,
} from "./general-chat";
import { createProject } from "./projects";
import {
  createRootSession,
  deleteUpstreamSessions,
  listProjectSessions,
  purgeLocalSessions,
} from "./project-sessions";

/* Creating General, and retiring the per-project Scheduled inboxes.
 *
 * Kept apart from general-chat.ts because this needs createProject and the
 * session helpers, and those import the lookups — the split is what keeps
 * the module graph acyclic. */

const MIGRATED_KEY = "scheduled_general_migrated";

// Pinned for the same reason as the watcher: HMR would otherwise leave a
// second copy of the promise behind, and the whole point is that there is one.
const globalForGeneral = globalThis as unknown as {
  __hermesPwaGeneral?: Promise<GeneralChat>;
  __hermesPwaGeneralMigration?: Promise<void>;
};

/**
 * Where scheduled reports land, creating it if this install has none yet.
 *
 * Lazily: an install that never binds a job never grows a General project.
 * It adopts an existing project called "General" before creating one, so a
 * user who had already set one up keeps it.
 *
 * Single-flight. A jobs route can ask for General while the watcher is
 * mid-delivery, and General's id is random — unlike the old
 * `<project>__scheduled` there is no deterministic upstream id to dedupe on —
 * so two concurrent callers would otherwise create two Generals.
 */
export function ensureGeneralChat(): Promise<GeneralChat> {
  const inFlight = globalForGeneral.__hermesPwaGeneral;
  if (inFlight) return inFlight;
  const pending = resolveGeneralChat().finally(() => {
    globalForGeneral.__hermesPwaGeneral = undefined;
  });
  globalForGeneral.__hermesPwaGeneral = pending;
  return pending;
}

async function resolveGeneralChat(): Promise<GeneralChat> {
  let projectId = generalProjectId();
  if (!projectId) {
    const named = db
      .prepare(
        `SELECT id FROM projects
          WHERE archived = 0 AND lower(trim(name)) = lower(?)
          ORDER BY last_active_at DESC LIMIT 1`,
      )
      .get(GENERAL_NAME) as { id: string } | undefined;
    projectId = named?.id ?? (await createProject({ name: GENERAL_NAME, pinned: true })).id;
    writeSetting(GENERAL_PROJECT_KEY, projectId);
    publishChange("project.changed", { projectId });
  }

  // A report nobody can see has not been delivered.
  const unarchived = db
    .prepare(`UPDATE projects SET archived = 0 WHERE id = ? AND archived = 1`)
    .run(projectId);
  if (unarchived.changes > 0) publishChange("project.changed", { projectId });

  const survivor = generalSurvivor(projectId);
  if (survivor) {
    if (survivor.archived === 1) {
      db.prepare(`UPDATE project_sessions SET archived = 0 WHERE session_id = ?`).run(
        survivor.session_id,
      );
      publishChange("session.changed", { projectId, sessionId: survivor.session_id });
    }
    return { projectId, sessionId: survivor.session_id };
  }
  // Nothing qualifies — every chat it had was a branch, a discussion or
  // archived. The migration deletes those, so start the one chat afresh.
  const session = await createRootSession(projectId, GENERAL_NAME);
  if (!session) throw new Error(`General project ${projectId} vanished`);
  return { projectId, sessionId: session.session_id };
}

export interface CleanupSession {
  session_id: string;
  project_id: string;
  parent_session_id: string | null;
  kind: string;
  bot_chat: number;
  archived: number;
}

export interface CleanupPlan {
  /** project id → session ids, children before parents */
  deletions: Map<string, string[]>;
  /** projects that would be left without a chat, and need a fresh one first */
  needsRoot: string[];
}

/**
 * What the retirement of the Scheduled inbox deletes: every inbox, every
 * discussion a reply to one spawned, every branch below either, and every
 * General session except the survivor. Never a Bot Chat — it is the Bot's,
 * and the Desktop, the CLI and other Bots all write to it.
 *
 * Pure, so the rules are tested without a gateway.
 */
export function planGeneralCleanup(
  sessions: CleanupSession[],
  discussionIds: ReadonlySet<string>,
  general: GeneralChat,
): CleanupPlan {
  const children = new Map<string, CleanupSession[]>();
  for (const session of sessions) {
    if (!session.parent_session_id) continue;
    const rows = children.get(session.parent_session_id) ?? [];
    rows.push(session);
    children.set(session.parent_session_id, rows);
  }

  const keep = (session: CleanupSession) =>
    session.bot_chat === 1 || session.session_id === general.sessionId;
  const seeds = sessions.filter(
    (session) =>
      session.kind === "scheduled" ||
      discussionIds.has(session.session_id) ||
      (session.project_id === general.projectId && session.session_id !== general.sessionId),
  );

  // Breadth-first, so reversing the order puts every child before its parent.
  const order: CleanupSession[] = [];
  const seen = new Set<string>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const session = queue.shift()!;
    if (seen.has(session.session_id)) continue;
    seen.add(session.session_id);
    if (!keep(session)) order.push(session);
    queue.push(...(children.get(session.session_id) ?? []));
  }

  const deletions = new Map<string, string[]>();
  for (const session of order.reverse()) {
    const ids = deletions.get(session.project_id) ?? [];
    ids.push(session.session_id);
    deletions.set(session.project_id, ids);
  }

  const doomed = new Set(order.map((session) => session.session_id));
  const needsRoot = [...deletions.keys()].filter(
    (projectId) =>
      projectId !== general.projectId &&
      !sessions.some(
        (session) =>
          session.project_id === projectId &&
          session.kind === "chat" &&
          session.archived === 0 &&
          !doomed.has(session.session_id),
      ),
  );
  return { deletions, needsRoot };
}

/**
 * One-time retirement of the per-project Scheduled inboxes.
 *
 * Every past report is re-homed into General's chat (ordered by its own
 * timestamp, so the history reads as it happened), every binding is pointed
 * at General, and the inboxes and reply threads are deleted here and in
 * Hermes. Destructive by request; the journal gets every id it removes.
 *
 * Re-runnable after a crash at any step: re-homing is idempotent, deletes
 * tolerate 404, the plan is recomputed from what is left, and the flag is
 * written last. Single-flight, because a route can force a watcher tick.
 */
export function migrateScheduledToGeneral(): Promise<void> {
  const inFlight = globalForGeneral.__hermesPwaGeneralMigration;
  if (inFlight) return inFlight;
  const pending = runMigration().finally(() => {
    globalForGeneral.__hermesPwaGeneralMigration = undefined;
  });
  globalForGeneral.__hermesPwaGeneralMigration = pending;
  return pending;
}

function count(sql: string): number {
  return (db.prepare(sql).get() as { count: number }).count;
}

async function runMigration(): Promise<void> {
  if (readSetting(MIGRATED_KEY) === "1") return;
  const pending =
    count(`SELECT COUNT(*) AS count FROM project_sessions WHERE kind = 'scheduled'`) +
    count(`SELECT COUNT(*) AS count FROM cron_discussions`) +
    count(`SELECT COUNT(*) AS count FROM cron_bindings`) +
    count(`SELECT COUNT(*) AS count FROM cron_deliveries`);
  if (pending === 0) {
    writeSetting(MIGRATED_KEY, "1");
    return;
  }

  const general = await ensureGeneralChat();
  db.transaction(() => {
    db.prepare(`UPDATE cron_deliveries SET project_id = ?, session_id = ?`).run(
      general.projectId,
      general.sessionId,
    );
    db.prepare(`UPDATE cron_bindings SET project_id = ?`).run(general.projectId);
  })();

  const sessions = db
    .prepare(
      `SELECT session_id, project_id, parent_session_id, kind, bot_chat, archived
         FROM project_sessions`,
    )
    .all() as CleanupSession[];
  const discussionIds = new Set(
    (db.prepare(`SELECT session_id FROM cron_discussions`).all() as { session_id: string }[])
      .map((row) => row.session_id),
  );
  const plan = planGeneralCleanup(sessions, discussionIds, general);

  // One project failing — a Bot whose profile key is wrong, say — must not
  // hold the others hostage. Its threads stay until a later pass succeeds,
  // and the flag is only written once every project has been cleaned.
  let failed = 0;
  for (const projectId of plan.needsRoot) {
    try {
      await createRootSession(projectId);
    } catch (err) {
      failed += 1;
      plan.deletions.delete(projectId);
      console.error(`[cron] could not give ${projectId} a fresh chat; retrying later:`, err);
    }
  }

  for (const [projectId, ids] of plan.deletions) {
    try {
      await deleteUpstreamSessions(projectId, ids);
    } catch (err) {
      failed += 1;
      console.error(`[cron] could not delete scheduled threads in ${projectId}; retrying later:`, err);
      continue;
    }
    const doomed = new Set(ids);
    const replacement =
      projectId === general.projectId
        ? general.sessionId
        : listProjectSessions(projectId)
            .filter((session) => session.kind === "chat" && !doomed.has(session.session_id))
            .sort((a, b) => b.last_active_at - a.last_active_at)[0]?.session_id;
    if (!replacement) throw new Error(`no chat left in ${projectId} after cleanup`);
    purgeLocalSessions(projectId, ids, replacement);
    console.log(
      `[cron] retired ${ids.length} scheduled thread(s) in ${projectId}: ${ids.join(", ")}`,
    );
    publishChange("session.deleted", {
      projectId,
      sessionId: ids[ids.length - 1],
      deletedSessionIds: ids,
      replacementSessionId: replacement,
    });
  }

  if (failed > 0) return;
  db.prepare(`DELETE FROM cron_discussions`).run();
  writeSetting(MIGRATED_KEY, "1");
  console.log(`[cron] scheduled reports now deliver to ${general.projectId}/${general.sessionId}`);
}
