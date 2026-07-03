/**
 * Parses a Claude.ai export's conversations.json into normalized Conversation[].
 *
 * Claude shape (abridged):
 *   [
 *     {
 *       uuid, name, created_at, updated_at,
 *       chat_messages: [
 *         { uuid, sender: "human"|"assistant", created_at,
 *           text?: string,                            // older exports
 *           content?: [{ type: "text", text }, ...]   // newer exports
 *         }
 *       ]
 *     }
 *   ]
 *
 * Defensive: malformed entries are silently skipped (counted). No content is
 * logged.
 */

import type {
  Conversation,
  ConversationMessage,
  NormalizedRole,
  ParsedExport,
} from "./types.js"

interface RawClaudeContentPart {
  type?: unknown
  text?: unknown
}

interface RawClaudeMessage {
  text?: unknown
  content?: unknown
  sender?: unknown
  created_at?: unknown
}

function parseClaudeMessageText(msg: RawClaudeMessage): string {
  if (typeof msg.text === "string") return msg.text
  if (Array.isArray(msg.content)) {
    return (msg.content as RawClaudeContentPart[])
      .filter((p) => p && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text as string)
      .join("\n")
  }
  return ""
}

function claudeSenderToRole(sender: unknown): NormalizedRole {
  if (sender === "human") return "user"
  if (sender === "assistant") return "assistant"
  return "other"
}

export function parseClaudeExport(rawJsonText: string): ParsedExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJsonText)
  } catch {
    return { format: "claude", conversations: [], skipped: 0 }
  }
  if (!Array.isArray(parsed)) {
    return { format: "claude", conversations: [], skipped: 0 }
  }

  const conversations: Conversation[] = []
  let skipped = 0

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      skipped++
      continue
    }
    const e = entry as Record<string, unknown>

    const id =
      (typeof e.uuid === "string" ? e.uuid : null) ??
      (typeof e.id === "string" ? e.id : null)
    if (!id) {
      skipped++
      continue
    }

    const messagesRaw = e.chat_messages
    if (!Array.isArray(messagesRaw)) {
      skipped++
      continue
    }

    const messages: ConversationMessage[] = []
    for (const m of messagesRaw) {
      if (!m || typeof m !== "object") continue
      const msg = m as RawClaudeMessage
      const text = parseClaudeMessageText(msg)
      if (text.trim().length === 0) continue
      messages.push({
        role: claudeSenderToRole(msg.sender),
        text,
        createdAt: typeof msg.created_at === "string" ? msg.created_at : undefined,
      })
    }

    if (messages.length === 0) {
      skipped++
      continue
    }

    const title = typeof e.name === "string" && e.name.length > 0 ? e.name : "(untitled)"
    const createdAt = typeof e.created_at === "string" ? e.created_at : undefined
    const updatedAt = typeof e.updated_at === "string" ? e.updated_at : undefined
    const charCount =
      title.length + messages.reduce((acc, mm) => acc + mm.text.length, 0)

    conversations.push({
      id,
      title,
      format: "claude",
      createdAt,
      updatedAt,
      messages,
      charCount,
    })
  }

  return { format: "claude", conversations, skipped }
}
