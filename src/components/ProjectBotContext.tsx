"use client";

import { createContext, useContext, type ReactNode } from "react";
import { AgentNameOverride } from "@/components/AgentNameContext";

/* The Hermes profile (Bot) the open project runs as.
 *
 * A Bot has its own skills, toolsets and model inventory, so every catalogue
 * the thread reads has to come from its `/p/<profile>/` mirror rather than
 * the default profile's. null is the default profile, which is every project
 * that is not bound to a Bot. */

const Context = createContext<string | null>(null);

export function ProjectBotProvider({
  profile,
  name,
  children,
}: {
  profile: string | null | undefined;
  name: string | null | undefined;
  children: ReactNode;
}) {
  return (
    <Context.Provider value={profile ?? null}>
      <AgentNameOverride name={name}>{children}</AgentNameOverride>
    </Context.Provider>
  );
}

export function useProjectBot(): string | null {
  return useContext(Context);
}

/** `?bot=<profile>` for the catalogue routes, or "" for the default profile. */
export function botQuery(profile: string | null | undefined, join: "?" | "&" = "?"): string {
  return profile ? `${join}bot=${encodeURIComponent(profile)}` : "";
}
