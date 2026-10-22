"use client";

import { CodeBlock } from "./CodeBlock";
import { FileLinks } from "./FileLinks";
import { parseRecommendation, RecommendationCard } from "./RecommendationCard";
import { IconCheck, IconFile } from "@/components/primitives/icons";
import { parseBlocks, type Block, type ListBlock } from "@/lib/markdown-blocks";
import { RECOMMEND_FENCE } from "@/lib/chat-types";
import type { Attachment, CronMeta, Recommendation } from "@/lib/chat-types";
import { useAgentName } from "@/components/AgentNameContext";

/* Message shapes follow ChatComposer's visual spec rather than its code —
 * that component takes no props at all. User turns are bubbles; assistant
 * turns are labelled sections, and a section still resolving is dimmed,
 * blurred and slightly scaled down. */

type Segment =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string; language?: string };

/** Splits ``` fences out of assistant text. Everything else stays literal —
 * no markdown renderer, so agent output can't inject markup. */
export function splitFences(content: string): Segment[] {
  const segments: Segment[] = [];
  const fence = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = fence.exec(content)) !== null) {
    if (match.index > cursor) {
      segments.push({ kind: "text", value: content.slice(cursor, match.index) });
    }
    segments.push({ kind: "code", value: match[2], language: match[1] || undefined });
    cursor = fence.lastIndex;
  }
  if (cursor < content.length) {
    segments.push({ kind: "text", value: content.slice(cursor) });
  }
  return segments.filter((s) => s.kind === "code" || s.value.trim().length > 0);
}

/**
 * Which segment carries the answerable question, or -1.
 *
 * A `kind: "question"` card is the run handing the decision back — the same
 * thing an approval is, minus the security gate — so the thread hoists it out
 * of the transcript and pins it above the composer. A `kind: "recommendation"`
 * card is commentary and stays where it was written. The *last* question wins:
 * an agent that asks twice in a turn is asking about the second thing, and the
 * earlier card stays inline as the record of a question already overtaken.
 */
function questionAt(segments: Segment[]): number {
  let index = -1;
  segments.forEach((segment, i) => {
    if (segment.kind !== "code" || segment.language !== RECOMMEND_FENCE) return;
    const parsed = parseRecommendation(segment.value);
    if (parsed && parsed.kind === "question" && parsed.actions.length > 0) index = i;
  });
  return index;
}

/** The question a turn ends on, for the thread's pinned decision slot. */
export function extractQuestion(content: string): Recommendation | null {
  const segments = splitFences(content);
  const at = questionAt(segments);
  if (at === -1) return null;
  const segment = segments[at];
  return segment.kind === "code" ? parseRecommendation(segment.value) : null;
}

/* Inline Markdown for generated text declared as `content_format: markdown`.
 *
 * There is still no markdown *document* renderer here, and the reason has not
 * changed: agent output must not be able to inject markup. This is narrower —
 * it tokenises the supported inline spans and builds React elements, so the text stays
 * text and there is no HTML anywhere in the path.
 *
 * Generated assistant output and cron reports share the same server-declared
 * contract. Plain messages never enter this path.
 */
const INLINE_MD = /(\[[^\]\n]+\]\(https?:\/\/[^\s)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/gi;

export function renderInline(text: string): React.ReactNode[] {
  return text.split(INLINE_MD).map((token, i) => {
    if (i % 2 === 0) return token;
    const link = /^\[([^\]\n]+)\]\((https?:\/\/[^\s)\n]+)\)$/i.exec(token);
    if (link) {
      return (
        <a
          key={i}
          href={link[2]}
          target="_blank"
          rel="noreferrer"
          className="text-accent underline underline-offset-2"
        >
          {link[1]}
        </a>
      );
    }
    if (token.startsWith("**") || token.startsWith("__")) {
      return (
        <strong key={i} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith("`")) {
      return (
        <code key={i} className="rounded bg-field px-1 font-mono text-[0.9em]">
          {token.slice(1, -1)}
        </code>
      );
    }
    return (
      <em key={i} className="italic">
        {token.slice(1, -1)}
      </em>
    );
  });
}

/* Block structure for the same declared-Markdown messages: headings, lists,
 * quotes, rules and tables. `parseBlocks` only tokenises; every element here
 * is built by React and every text field goes through renderInline, so the
 * no-HTML guarantee above holds for blocks too. */

function List({ list }: { list: ListBlock }) {
  const Tag = list.ordered ? "ol" : "ul";
  const tasks = list.items.some((item) => item.checked !== undefined);
  return (
    <Tag
      start={list.ordered && list.start !== 1 ? list.start : undefined}
      className={`flex flex-col gap-1 pl-5 marker:text-ink-3 ${
        tasks ? "list-none pl-1" : list.ordered ? "list-decimal" : "list-disc"
      }`}
    >
      {list.items.map((item, i) => (
        <li key={i} className="pl-0.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {item.checked !== undefined && (
            <span
              aria-label={item.checked ? "done" : "not done"}
              className={`mr-2 inline-grid size-3.5 translate-y-0.5 place-items-center rounded-[4px] ${
                item.checked ? "bg-ink text-surface" : "shadow-[inset_0_0_0_1.5px_var(--line-strong)]"
              }`}
            >
              {item.checked && <IconCheck size={10} strokeWidth={3} />}
            </span>
          )}
          {renderInline(item.text)}
          {item.children && (
            <div className="mt-1">
              <List list={item.children} />
            </div>
          )}
        </li>
      ))}
    </Tag>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return (
        <p
          role="heading"
          aria-level={block.level + 1}
          className="mt-1.5 font-semibold text-ink first:mt-0 [overflow-wrap:anywhere]"
          style={{
            fontSize:
              block.level === 1 ? "calc(var(--text-body) * 1.2)" : block.level === 2 ? "calc(var(--text-body) * 1.07)" : "var(--text-body)",
            lineHeight: 1.35,
          }}
        >
          {renderInline(block.text)}
        </p>
      );
    case "list":
      return (
        <div className="text-body text-ink">
          <List list={block} />
        </div>
      );
    case "quote":
      return (
        <blockquote className="flex flex-col gap-2 border-l-2 border-line-strong pl-3 text-ink-2">
          {block.blocks.map((inner, i) => (
            <MarkdownBlock key={i} block={inner} />
          ))}
        </blockquote>
      );
    case "rule":
      return <hr className="my-1 border-line" />;
    case "table":
      return (
        // its own horizontal scroll, so a wide table never widens the thread
        <div className="scroll-area -mx-0.5 overflow-x-auto rounded-control p-0.5">
          <table className="w-full border-collapse overflow-hidden rounded-control text-label text-ink shadow-hairline">
            <thead className="bg-field">
              <tr>
                {block.header.map((cell, c) => (
                  <th
                    key={c}
                    className="px-2.5 py-1.5 font-semibold whitespace-nowrap"
                    style={{ textAlign: block.align[c] ?? "left" }}
                  >
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-t border-line">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className="px-2.5 py-1.5 align-top [overflow-wrap:anywhere]"
                      style={{ textAlign: block.align[c] ?? "left" }}
                    >
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "paragraph":
      return (
        <p className="text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
          {renderInline(block.text)}
        </p>
      );
  }
}

export function MessageBody({
  content,
  streaming = false,
  hoistQuestions = false,
  markdown = false,
  onRecommendationAction,
}: {
  content: string;
  /** text is still arriving, so a fence may be half-written */
  streaming?: boolean;
  /** the thread is showing the question card above the composer instead */
  hoistQuestions?: boolean;
  /** resolve inline bold/italic/code rather than printing the markers */
  markdown?: boolean;
  /** only passed for the newest assistant turn — see RecommendationCard */
  onRecommendationAction?: (reply: string) => void;
}) {
  const segments = splitFences(content);
  const hoisted = hoistQuestions ? questionAt(segments) : -1;

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.kind !== "code" && markdown) {
          return parseBlocks(segment.value).map((block, b) => (
            <MarkdownBlock key={`${i}.${b}`} block={block} />
          ));
        }
        if (segment.kind !== "code") {
          return (
            <p
              key={i}
              className="text-body whitespace-pre-wrap text-ink [overflow-wrap:anywhere]"
            >
              {segment.value.trim()}
            </p>
          );
        }
        if (segment.language === RECOMMEND_FENCE) {
          // This exact card is pinned above the composer — drawing it here
          // too would ask the same question twice.
          if (i === hoisted) return null;
          const recommendation = parseRecommendation(segment.value);
          if (recommendation) {
            return (
              <RecommendationCard
                key={i}
                recommendation={recommendation}
                onAction={onRecommendationAction}
              />
            );
          }
          /* splitFences matches an unterminated fence, so mid-stream this is
           * half a JSON object. Rendering it would paint raw braces into the
           * thread and then snap them into a card. Hold it back until the run
           * settles — at which point unparseable really does mean malformed,
           * and the code block below is the honest fallback rather than
           * swallowing text the agent meant to be read. */
          if (streaming) return null;
        }
        return <CodeBlock key={i} code={segment.value} language={segment.language} />;
      })}
    </>
  );
}

/* Attachment chips, shown on the turn that carried them. Images are inline
 * data: URLs, so there is nothing to fetch; files are links back through
 * /api/files, which is path-allowlisted server-side. */
export function AttachmentStrip({
  attachments,
  align = "start",
}: {
  attachments: Attachment[];
  align?: "start" | "end";
}) {
  if (attachments.length === 0) return null;
  return (
    <div
      className={`flex flex-wrap gap-1.5 ${align === "end" ? "justify-end" : ""}`}
    >
      {attachments.map((attachment, i) =>
        attachment.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            // Prefer the stored copy: a phone photo's data: URL is megabytes of
            // base64 sitting in the DOM for as long as the thread is open.
            src={
              attachment.path
                ? `/api/files?path=${encodeURIComponent(attachment.path)}`
                : attachment.url
            }
            alt={attachment.name}
            className="max-h-40 max-w-[70%] rounded-control object-cover shadow-hairline"
          />
        ) : (
          <a
            key={i}
            href={`/api/files?path=${encodeURIComponent(attachment.path)}`}
            className="flex h-8 max-w-full items-center gap-1.5 rounded-chip bg-field px-2
              text-meta text-ink-2 shadow-hairline transition-colors duration-100
              hover:text-ink"
          >
            <span className="shrink-0 text-ink-3">
              <IconFile size={12} />
            </span>
            <span className="truncate font-mono">{attachment.name}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function UserMessage({
  content,
  attachments,
  footer,
}: {
  content: string;
  attachments?: Attachment[];
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="group/msg flex flex-col items-end gap-1.5 pl-6"
      style={{ animation: "fade-up var(--duration-medium) var(--ease-out-strong) both" }}
    >
      {attachments && attachments.length > 0 && (
        <AttachmentStrip attachments={attachments} align="end" />
      )}
      {content.trim() && (
        // asymmetric radius — the corner nearest the sender is squared off, so
        // the bubble reads as anchored to the right edge rather than floating
        <div className="max-w-[88%] rounded-[18px] rounded-br-[6px] bg-field px-3.5 py-2.5 text-body text-ink shadow-hairline [overflow-wrap:anywhere] whitespace-pre-wrap">
          {content}
        </div>
      )}
      {/* On the live turn the strip above already drew these; after a reload
        * `attachments` is gone and this is what brings them back, from the
        * paths composeInput() wrote into the prompt. */}
      <FileLinks
        text={content}
        exclude={(attachments ?? []).flatMap((a) => (a.path ? [a.path] : []))}
      />
      {footer}
    </div>
  );
}

export function AssistantMessage({
  content,
  markdown = false,
  streaming = false,
  resolving = false,
  footer,
  hoistQuestions = false,
  onRecommendationAction,
}: {
  content: string;
  /** Interpret safe Markdown spans declared by the message contract. */
  markdown?: boolean;
  /** show the caret — text is still arriving */
  streaming?: boolean;
  /** dimmed/blurred: written, but the run hasn't settled */
  resolving?: boolean;
  footer?: React.ReactNode;
  /** the thread is showing this turn's question card above the composer */
  hoistQuestions?: boolean;
  /** only set on the newest turn, so old cards' buttons go inert */
  onRecommendationAction?: (reply: string) => void;
}) {
  const agentName = useAgentName();

  return (
    <div
      className="group/msg flex w-full flex-col gap-1.5 transition-[opacity,filter,transform] duration-400"
      style={{
        opacity: resolving ? 0.55 : 1,
        filter: resolving ? "blur(var(--blur-subtle))" : "blur(0)",
        transform: resolving ? "scale(var(--scale-sm))" : "scale(1)",
        transformOrigin: "top left",
        transitionTimingFunction: "var(--ease-out-strong)",
        animation: "fade-up var(--duration-slow) var(--ease-out-strong) both",
      }}
    >
      <div className="text-micro font-semibold tracking-[0.08em] text-ink-3 uppercase">
        {agentName}
      </div>
      <div className="flex flex-col gap-2.5">
        <MessageBody
          content={content}
          markdown={markdown}
          streaming={streaming}
          hoistQuestions={hoistQuestions}
          onRecommendationAction={onRecommendationAction}
        />
        {streaming && (
          <span
            aria-hidden
            className="inline-block h-3.5 w-0.5 translate-y-0.5 rounded-full bg-ink"
            style={{ animation: "caret-blink 1s step-end infinite" }}
          />
        )}
        {/* Not while streaming: a half-arrived path is a different path, and
          * probing it would 404 once per token. */}
        {!streaming && <FileLinks text={content} />}
      </div>
      {footer}
    </div>
  );
}

/* A scheduled job's result.
 *
 * Deliberately the same shape as an assistant turn — same label row, same
 * body, same spacing — because that is what it is to read: something the
 * agent said, in this project, unprompted. The only difference is the header, which
 * has to say so, since nobody typed the message that produced it.
 *
 * The body goes through MessageBody with its declared Markdown resolved. No
 * recommendation handling: an unattended job has nobody to ask.
 */
export function CronMessage({
  content,
  meta,
  markdown,
  footer,
}: {
  content: string;
  meta: CronMeta;
  markdown: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="group/msg flex w-full flex-col gap-1.5"
      style={{ animation: "fade-up var(--duration-slow) var(--ease-out-strong) both" }}
    >
      <div className="text-micro font-semibold tracking-[0.08em] text-ink-3 uppercase">
        Scheduled · {meta.jobName}
        {meta.status === "failed" ? " · failed" : ""}
      </div>
      <div className="flex flex-col gap-2.5">
        <MessageBody content={content} markdown={markdown} />
        {/* Same path probe as any other turn. A job that wrote outside the
          * outbox, the upload cache or a project cwd renders as plain text —
          * the allowlist is the security model, and a scheduled prompt naming
          * a path is no more evidence than an interactive one. */}
        <FileLinks text={content} />
      </div>
      {footer}
    </div>
  );
}

export function SystemMessage({ content }: { content: string }) {
  return (
    <p
      className="text-label text-ink-3"
      style={{ animation: "fade-in var(--duration-fast) ease-out both" }}
    >
      {content}
    </p>
  );
}
