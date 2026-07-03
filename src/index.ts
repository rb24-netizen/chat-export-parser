import { parseChatGPTExport } from "./parse-chatgpt.js"
import { parseClaudeExport } from "./parse-claude.js"
import { extractConversationsJSON } from "./container.js"
import type { ParsedExport } from "./types.js"

export type {
  Conversation,
  ConversationMessage,
  NormalizedRole,
  ExportFormat,
  ParsedExport,
} from "./types.js"

export { parseChatGPTExport } from "./parse-chatgpt.js"
export { parseClaudeExport } from "./parse-claude.js"
export {
  detectContainerKind,
  detectExportFormat,
  extractConversationsJSON,
} from "./container.js"
export type { ContainerKind, ExtractedExport } from "./container.js"

/**
 * One-call entry point. Takes the bytes of an uploaded export (ZIP or raw
 * conversations.json), detects the vendor, and returns the normalized result.
 * Returns an empty ParsedExport with format "unknown" if the bytes are not a
 * recognizable export.
 */
export function parseExport(bytes: Uint8Array): ParsedExport {
  const extracted = extractConversationsJSON(bytes)
  if (!extracted) return { format: "unknown", conversations: [], skipped: 0 }
  if (extracted.format === "chatgpt") return parseChatGPTExport(extracted.jsonText)
  if (extracted.format === "claude") return parseClaudeExport(extracted.jsonText)
  return { format: "unknown", conversations: [], skipped: 0 }
}
