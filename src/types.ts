/**
 * Normalized types produced by the parsers.
 *
 * A ParsedExport is what every vendor-specific parser returns: a flat list of
 * Conversation objects (each with an ordered message list) plus a count of
 * entries the parser had to drop because they were structurally malformed.
 */

export type ExportFormat = "chatgpt" | "claude" | "unknown"

export type NormalizedRole = "user" | "assistant" | "system" | "other"

export interface ConversationMessage {
  role: NormalizedRole
  text: string
  /** ISO 8601 if the source export included it. */
  createdAt?: string
}

/** A single conversation, normalized across vendors. */
export interface Conversation {
  id: string
  title: string
  format: ExportFormat
  createdAt?: string
  updatedAt?: string
  messages: ConversationMessage[]
  /** title.length plus the sum of every message's text.length. */
  charCount: number
}

export interface ParsedExport {
  format: ExportFormat
  conversations: Conversation[]
  /** Entries the parser dropped because they were structurally malformed. */
  skipped: number
}
