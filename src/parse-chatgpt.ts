/**
 * Parses a ChatGPT export's conversations.json into normalized Conversation[].
 *
 * ChatGPT shape (abridged):
 *   [
 *     {
 *       id, title, create_time, update_time,
 *       current_node: <leafNodeId>,
 *       mapping: { [nodeId]: { id, message?, parent, children } }
 *     }
 *   ]
 *
 * The canonical thread is reconstructed by walking from current_node up via
 * parent pointers, then reversing. Branches the user is not currently on are
 * intentionally dropped, matching what the user sees in the ChatGPT UI.
 *
 * The parser is defensive: malformed entries are silently skipped (counted)
 * rather than throwing. No conversation content is logged.
 */

import type {
  Conversation,
  ConversationMessage,
  NormalizedRole,
  ParsedExport,
} from "./types.js"

interface RawAuthor {
  role?: unknown
}

interface RawContent {
  content_type?: unknown
  parts?: unknown
  text?: unknown
}

interface RawMessage {
  author?: RawAuthor
  content?: RawContent
  create_time?: unknown
}

interface RawNode {
  message?: RawMessage | null
  parent?: unknown
  children?: unknown
}

function parseChatGPTContent(content: unknown): string {
  if (!content || typeof content !== "object") return ""
  const c = content as RawContent
  if (Array.isArray(c.parts)) {
    return c.parts.filter((p): p is string => typeof p === "string").join("\n")
  }
  if (typeof c.text === "string") return c.text
  return ""
}

function chatGPTRoleToNormal(role: unknown): NormalizedRole {
  if (role === "user") return "user"
  if (role === "assistant") return "assistant"
  if (role === "system") return "system"
  return "other"
}

function isoFromUnixSeconds(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return new Date(value * 1000).toISOString()
}

export function parseChatGPTExport(rawJsonText: string): ParsedExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJsonText)
  } catch {
    return { format: "chatgpt", conversations: [], skipped: 0 }
  }
  if (!Array.isArray(parsed)) {
    return { format: "chatgpt", conversations: [], skipped: 0 }
  }

  const conversations: Conversation[] = []
  let skipped = 0

  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      skipped++
      continue
    }
    const e = entry as Record<string, unknown>

    const id = typeof e.id === "string" ? e.id : null
    if (!id) {
      skipped++
      continue
    }

    const mapping = e.mapping
    if (!mapping || typeof mapping !== "object") {
      skipped++
      continue
    }
    const m = mapping as Record<string, RawNode>

    const currentNodeId = typeof e.current_node === "string" ? e.current_node : null

    const orderedNodes: RawNode[] = []
    let cursor: string | null = currentNodeId
    const visited = new Set<string>()
    while (cursor && !visited.has(cursor)) {
      const node = m[cursor]
      if (!node) break
      visited.add(cursor)
      orderedNodes.push(node)
      const parent = node.parent
      cursor = typeof parent === "string" ? parent : null
    }
    orderedNodes.reverse()

    const messages: ConversationMessage[] = []
    for (const node of orderedNodes) {
      const msg = node?.message
      if (!msg) continue
      const text = parseChatGPTContent(msg.content)
      if (text.trim().length === 0) continue
      messages.push({
        role: chatGPTRoleToNormal(msg.author?.role),
        text,
        createdAt: isoFromUnixSeconds(msg.create_time),
      })
    }

    if (messages.length === 0) {
      skipped++
      continue
    }

    const title = typeof e.title === "string" && e.title.length > 0 ? e.title : "(untitled)"
    const createdAt = isoFromUnixSeconds(e.create_time)
    const updatedAt = isoFromUnixSeconds(e.update_time)
    const charCount =
      title.length + messages.reduce((acc, mm) => acc + mm.text.length, 0)

    conversations.push({
      id,
      title,
      format: "chatgpt",
      createdAt,
      updatedAt,
      messages,
      charCount,
    })
  }

  return { format: "chatgpt", conversations, skipped }
}
