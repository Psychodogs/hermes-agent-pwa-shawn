import { error, withDevice } from "@/lib/api/v1/http";

/* Retired. Replying to a report used to spawn a new root discussion; reports
 * now arrive in the General chat, and a reply is an ordinary message there
 * (POST …/sessions/{scheduledSessionId}/messages). Kept so an old client gets
 * a reason instead of a 404. */
export async function POST(request: Request) {
  return withDevice(request, async () =>
    error(
      410,
      "scheduled_reply_removed",
      "Scheduled reports arrive in the General chat now. Reply there as an ordinary message.",
    ),
  );
}
