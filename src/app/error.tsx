"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RecoveryScreen, recoveryPrimary, recoverySecondary } from "@/components/RecoveryScreen";
import { APP_NAME } from "@/lib/branding";

/* A route that threw while rendering. Like not-found, it must offer a way out:
 * the installed app has no Back button. `retry` re-fetches and re-renders the
 * segment — the Next 16 prop, in place of `reset` — which is usually enough
 * when the cause was the gateway being briefly unreachable. */
export default function ErrorScreen({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <RecoveryScreen
      title="Something went wrong"
      body="This screen didn’t load. Trying again usually fixes it."
      // In production a server error reaches the client as a generic message
      // plus this digest, which is what matches it to the server's log.
      detail={error.digest ? `Reference ${error.digest}` : undefined}
      actions={
        <>
          <button type="button" onClick={() => retry()} className={recoveryPrimary}>
            Try again
          </button>
          <Link href="/" className={recoverySecondary}>
            Back to {APP_NAME}
          </Link>
        </>
      }
    />
  );
}
