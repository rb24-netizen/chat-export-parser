/**
 * Container detection and ZIP unpacking for account exports.
 *
 * Strategy:
 *   1. Detect container kind from magic bytes (ZIP) or leading whitespace + JSON brace.
 *   2. If ZIP: unpack with fflate (pure JS, browser-safe), find conversations.json.
 *   3. If JSON: decode bytes as UTF-8.
 *   4. Detect the vendor format from the JSON shape itself.
 *
 * No conversation content is ever logged. Failures return null rather than
 * throwing, so callers can surface a generic "unsupported export" message.
 */

import { unzipSync, strFromU8 } from "fflate"
import type { ExportFormat } from "./types.js"

export type ContainerKind = "zip" | "json" | "unknown"

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] // PK\x03\x04
const JSON_OPEN_BYTES = new Set<number>([0x5b /* [ */, 0x7b /* { */])
const WHITESPACE_BYTES = new Set<number>([0x20, 0x09, 0x0a, 0x0d])

export function detectContainerKind(bytes: Uint8Array): ContainerKind {
  if (bytes.length < 4) return "unknown"
  if (
    bytes[0] === ZIP_MAGIC[0] &&
    bytes[1] === ZIP_MAGIC[1] &&
    bytes[2] === ZIP_MAGIC[2] &&
    bytes[3] === ZIP_MAGIC[3]
  ) {
    return "zip"
  }
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b === undefined || !WHITESPACE_BYTES.has(b)) break
    i++
  }
  const head = bytes[i]
  if (head !== undefined && JSON_OPEN_BYTES.has(head)) return "json"
  return "unknown"
}

/**
 * Inspect a parsed conversations.json (as text) and report which vendor's
 * export it appears to be. Schema-shape sniff only; no content is logged.
 */
export function detectExportFormat(rawJsonText: string): ExportFormat {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJsonText)
  } catch {
    return "unknown"
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return "unknown"
  const first = parsed[0]
  if (!first || typeof first !== "object") return "unknown"
  const f = first as Record<string, unknown>
  if ("mapping" in f && "current_node" in f) return "chatgpt"
  if (Array.isArray(f.chat_messages)) return "claude"
  if (typeof f.uuid === "string" && typeof f.name === "string") return "claude"
  return "unknown"
}

export interface ExtractedExport {
  /** Text of the conversations.json file. */
  jsonText: string
  /** Detected by schema shape. */
  format: ExportFormat
}

/**
 * Given the bytes of an uploaded export (ZIP or raw JSON), extract the
 * conversations.json text and detect its vendor format. Returns null when the
 * input does not appear to be a supported export.
 */
export function extractConversationsJSON(bytes: Uint8Array): ExtractedExport | null {
  const kind = detectContainerKind(bytes)

  if (kind === "json") {
    const text = strFromU8(bytes)
    return { jsonText: text, format: detectExportFormat(text) }
  }

  if (kind === "zip") {
    let entries: Record<string, Uint8Array>
    try {
      entries = unzipSync(bytes)
    } catch {
      return null
    }
    const path = Object.keys(entries).find((p) =>
      /(?:^|\/)conversations\.json$/i.test(p)
    )
    if (!path) return null
    const bytesInZip = entries[path]
    if (!bytesInZip) return null
    const text = strFromU8(bytesInZip)
    return { jsonText: text, format: detectExportFormat(text) }
  }

  return null
}
