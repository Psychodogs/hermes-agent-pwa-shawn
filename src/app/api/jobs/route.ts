import { db } from "@/lib/db";
import { hermes, type CreateJobParams, type HermesJob } from "@/lib/hermes";
import { isCronUnavailable, jobErrorResponse } from "@/lib/job-errors";
import { fireKey, setBinding } from "@/lib/cron-watcher";
import { publishChange } from "@/lib/api-changes";
import { ensureGeneralChat } from "@/lib/general-chat-setup";

// Live proxy: never cached. A zero-argument GET is prerendered at build time
// otherwise, and this one would serve an empty job list forever.
export const dynamic = "force-dynamic";

interface BindingRow {
  job_id: string;
  project_id: string;
}

/** The job as the client sees it: Hermes' object plus where we deliver it. */
function withBindings(jobs: HermesJob[]) {
  const rows = db
    .prepare(
      `SELECT b.job_id, b.project_id, p.name AS project_name
         FROM cron_bindings b JOIN projects p ON p.id = b.project_id`,
    )
    .all() as (BindingRow & { project_name: string })[];
  const byJob = new Map(rows.map((r) => [r.job_id, r]));
  return jobs.map((job) => ({ ...job, binding: byJob.get(job.id) ?? null }));
}

export async function GET() {
  try {
    // include_disabled, always: pause sets enabled:false and the default list
    // hides those, so a paused job would vanish from this screen entirely.
    const { jobs } = await hermes.jobs.list({ includeDisabled: true });
    return Response.json({ jobs: withBindings(jobs) });
  } catch (err) {
    if (isCronUnavailable(err)) {
      return Response.json({ jobs: [], unavailable: true });
    }
    return jobErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | (CreateJobParams & { binding?: { project_id?: string } })
    | null;

  if (!body?.name?.trim()) {
    return Response.json({ error: "A name is required" }, { status: 400 });
  }
  if (!body.schedule?.trim()) {
    return Response.json({ error: "A schedule is required" }, { status: 400 });
  }

  /* A binding means "report to this app", and the app has one place for
   * that: the General chat. `project_id` is still required by the v1 contract
   * but its value is ignored — older clients send a project's id, which now
   * lands in General like everything else. */
  const bind = Boolean(body.binding?.project_id);

  try {
    const general = bind ? await ensureGeneralChat() : null;
    const { job } = await hermes.jobs.create({
      name: body.name.trim(),
      schedule: body.schedule.trim(),
      prompt: body.prompt ?? "",
      /* One destination. A bound job is delivered by this app,
       * which reads the output file Hermes writes regardless — so naming a
       * gateway platform as well would announce the same fire twice. The
       * server decides this rather than trusting the form. */
      deliver: general ? "local" : body.deliver?.trim() || "local",
      skills: body.skills?.length ? body.skills : undefined,
      repeat: typeof body.repeat === "number" ? body.repeat : undefined,
    });

    if (general) {
      // A job that has never fired stamps "", so its first output delivers.
      setBinding(job.id, general.projectId, fireKey(job) ?? "");
    }
    publishChange("job.changed", { jobId: job.id });
    return Response.json({ job }, { status: 201 });
  } catch (err) {
    return jobErrorResponse(err);
  }
}
