import { createHash } from "node:crypto";

import { absorbCodexMeta, type CodexFileState } from "./codex.js";
import { isRecord } from "./guards.js";
import type { TranscriptSource } from "./types.js";

const USAGE_KEYS = [
  "inputTokens",
  "cachedInputTokens",
  "cacheCreationInputTokens",
  "outputTokens",
  "reasoningOutputTokens",
  "totalTokens",
] as const;

type UsageKey = (typeof USAGE_KEYS)[number];

type TokenUsage = Partial<Record<UsageKey, number>>;

export interface UsageEvent {
  file: string;
  /** The usage-carrying line: for a split Claude reply, its final line. */
  lineIndex: number;
  source: TranscriptSource;
  cwd?: string | undefined;
  timestamp?: string | undefined;
  timestampMs?: number | undefined;
  sessionId?: string | undefined;
  gitBranch?: string | undefined;
  isSidechain: boolean;
  agentId?: string | undefined;
  messageId?: string | undefined;
  /** Claude only: false when no line of the reply carried its final usage. */
  final?: boolean | undefined;
  usage: TokenUsage;
}

export interface ClaudeUsageLine {
  messageId: string;
  event: UsageEvent;
  isFinal: boolean;
}

export interface CodexUsageLine {
  event: UsageEvent;
  infoKey: string;
}

function nonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function compact(fields: Partial<Record<UsageKey, number | undefined>>) {
  const usage: TokenUsage = {};
  for (const key of USAGE_KEYS) {
    const value = fields[key];
    if (value !== undefined) usage[key] = value;
  }
  return usage;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function timestampFields(raw: unknown) {
  const timestamp = str(raw);
  const parsed = timestamp === undefined ? NaN : Date.parse(timestamp);
  return { timestamp, timestampMs: Number.isNaN(parsed) ? undefined : parsed };
}

/** Claude Code before 2.1.307 wrote placeholder usage on a reply's early lines, with neither of these. */
export function isFinalClaudeUsage(
  message: Record<string, unknown>,
  usage: Record<string, unknown>,
): boolean {
  return message["stop_reason"] != null || usage["iterations"] != null;
}

export function isDuplicateCodexEvent(
  previousInfoKey: string | undefined,
  infoKey: string,
): boolean {
  return previousInfoKey === infoKey;
}

export function parseClaudeUsageLine(
  file: string,
  lineIndex: number,
  line: string,
): ClaudeUsageLine | undefined {
  if (!line.includes('"usage"')) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed) || parsed["type"] !== "assistant") return undefined;
  const message = parsed["message"];
  if (!isRecord(message)) return undefined;
  const messageId = message["id"];
  const usage = message["usage"];
  if (typeof messageId !== "string" || messageId === "") return undefined;
  if (!isRecord(usage)) return undefined;

  const input = nonNegativeInt(usage["input_tokens"]);
  const cacheRead = nonNegativeInt(usage["cache_read_input_tokens"]);
  const cacheCreation = nonNegativeInt(usage["cache_creation_input_tokens"]);
  const output = nonNegativeInt(usage["output_tokens"]);
  // A partial sum would read as a complete figure, so one bad part drops the key.
  const inputTokens =
    input === undefined ||
    cacheRead === undefined ||
    cacheCreation === undefined
      ? undefined
      : input + cacheRead + cacheCreation;

  return {
    messageId,
    isFinal: isFinalClaudeUsage(message, usage),
    event: {
      file,
      lineIndex,
      source: "claude",
      cwd: str(parsed["cwd"]),
      ...timestampFields(parsed["timestamp"]),
      sessionId: str(parsed["sessionId"]),
      gitBranch: str(parsed["gitBranch"]),
      isSidechain: parsed["isSidechain"] === true,
      agentId: str(parsed["agentId"]),
      messageId,
      usage: compact({
        inputTokens,
        cachedInputTokens: cacheRead,
        cacheCreationInputTokens: cacheCreation,
        outputTokens: output,
        totalTokens:
          inputTokens === undefined || output === undefined
            ? undefined
            : inputTokens + output,
      }),
    },
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function parseCodexUsageLine(
  file: string,
  lineIndex: number,
  line: string,
  state: CodexFileState,
): CodexUsageLine | undefined {
  if (
    !line.includes('"token_count"') &&
    !line.includes('"session_meta"') &&
    !line.includes('"turn_context"')
  ) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const payload = parsed["payload"];
  if (!isRecord(payload)) return undefined;
  if (absorbCodexMeta(parsed["type"], payload, state)) return undefined;
  if (parsed["type"] !== "event_msg" || payload["type"] !== "token_count") {
    return undefined;
  }
  const info = payload["info"];
  if (!isRecord(info)) return undefined;
  const last = info["last_token_usage"];
  if (!isRecord(last) || !isRecord(info["total_token_usage"])) return undefined;

  return {
    infoKey: createHash("sha1").update(stableStringify(info)).digest("base64"),
    event: {
      file,
      lineIndex,
      source: "codex",
      cwd: state.cwd,
      ...timestampFields(parsed["timestamp"]),
      sessionId: state.sessionId,
      gitBranch: state.gitBranch,
      isSidechain: state.isSubagent,
      agentId: state.isSubagent ? state.threadId : undefined,
      usage: compact({
        inputTokens: nonNegativeInt(last["input_tokens"]),
        cachedInputTokens: nonNegativeInt(last["cached_input_tokens"]),
        cacheCreationInputTokens: nonNegativeInt(
          last["cache_write_input_tokens"],
        ),
        outputTokens: nonNegativeInt(last["output_tokens"]),
        reasoningOutputTokens: nonNegativeInt(last["reasoning_output_tokens"]),
        totalTokens: nonNegativeInt(last["total_tokens"]),
      }),
    },
  };
}

export function formatUsageJson(event: UsageEvent): string {
  return JSON.stringify({
    file: event.file,
    lineIndex: event.lineIndex,
    source: event.source,
    cwd: event.cwd,
    timestamp: event.timestamp,
    sessionId: event.sessionId,
    gitBranch: event.gitBranch,
    isSubagent: event.isSidechain,
    ...(event.isSidechain
      ? {
          agentId: event.agentId,
          ...(event.sessionId === event.agentId
            ? {}
            : { parentSessionId: event.sessionId }),
        }
      : {}),
    ...(event.messageId !== undefined ? { messageId: event.messageId } : {}),
    ...(event.final !== undefined ? { final: event.final } : {}),
    usage: event.usage,
  });
}
