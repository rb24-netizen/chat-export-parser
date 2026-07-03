import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { zipSync, strToU8 } from "fflate"
import {
  parseChatGPTExport,
  parseClaudeExport,
  parseExport,
  detectContainerKind,
  detectExportFormat,
  extractConversationsJSON,
} from "../src/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const chatgptJson = readFileSync(join(here, "fixtures/chatgpt.json"), "utf8")
const claudeJson = readFileSync(join(here, "fixtures/claude.json"), "utf8")

describe("parseChatGPTExport", () => {
  it("normalizes a synthetic ChatGPT export", () => {
    const result = parseChatGPTExport(chatgptJson)
    expect(result.format).toBe("chatgpt")
    expect(result.conversations).toHaveLength(1)
    const conv = result.conversations[0]!
    expect(conv.id).toBe("conv-1")
    expect(conv.title).toBe("Test conversation")
    expect(conv.messages).toHaveLength(2)
    expect(conv.messages[0]).toMatchObject({ role: "user", text: "hello world" })
    expect(conv.messages[1]).toMatchObject({ role: "assistant", text: "hi back" })
    expect(conv.createdAt).toBe(new Date(1700000000 * 1000).toISOString())
    expect(result.skipped).toBe(0)
  })

  it("returns an empty result on malformed JSON", () => {
    const result = parseChatGPTExport("{ not json")
    expect(result.format).toBe("chatgpt")
    expect(result.conversations).toEqual([])
    expect(result.skipped).toBe(0)
  })

  it("counts entries with no valid messages as skipped", () => {
    const empty = JSON.stringify([{ id: "x", current_node: null, mapping: {} }])
    const result = parseChatGPTExport(empty)
    expect(result.conversations).toEqual([])
    expect(result.skipped).toBe(1)
  })
})

describe("parseClaudeExport", () => {
  it("normalizes a synthetic Claude export", () => {
    const result = parseClaudeExport(claudeJson)
    expect(result.format).toBe("claude")
    expect(result.conversations).toHaveLength(1)
    const conv = result.conversations[0]!
    expect(conv.id).toBe("conv-abc")
    expect(conv.title).toBe("Test chat")
    expect(conv.messages).toHaveLength(2)
    expect(conv.messages[0]).toMatchObject({ role: "user", text: "hello" })
    expect(conv.messages[1]).toMatchObject({ role: "assistant", text: "hi there" })
  })

  it("returns an empty result on malformed JSON", () => {
    const result = parseClaudeExport("nope")
    expect(result.format).toBe("claude")
    expect(result.conversations).toEqual([])
  })

  it("supports both older text and newer content shapes", () => {
    const mixed = JSON.stringify([
      {
        uuid: "c1",
        name: "mixed",
        chat_messages: [
          { sender: "human", text: "old-shape" },
          { sender: "assistant", content: [{ type: "text", text: "new-shape" }] },
        ],
      },
    ])
    const result = parseClaudeExport(mixed)
    expect(result.conversations[0]!.messages.map((m) => m.text)).toEqual([
      "old-shape",
      "new-shape",
    ])
  })
})

describe("detectContainerKind", () => {
  it("detects ZIP magic bytes", () => {
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
    expect(detectContainerKind(bytes)).toBe("zip")
  })

  it("detects JSON after leading whitespace", () => {
    const bytes = strToU8("   \n[{}]")
    expect(detectContainerKind(bytes)).toBe("json")
  })

  it("returns unknown for random bytes", () => {
    expect(detectContainerKind(new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]))).toBe(
      "unknown"
    )
  })
})

describe("detectExportFormat", () => {
  it("detects ChatGPT shape", () => {
    expect(detectExportFormat(chatgptJson)).toBe("chatgpt")
  })
  it("detects Claude shape", () => {
    expect(detectExportFormat(claudeJson)).toBe("claude")
  })
  it("returns unknown for empty arrays", () => {
    expect(detectExportFormat("[]")).toBe("unknown")
  })
})

describe("extractConversationsJSON", () => {
  it("extracts from a synthetic ZIP containing conversations.json", () => {
    const zipped = zipSync({ "conversations.json": strToU8(chatgptJson) })
    const extracted = extractConversationsJSON(zipped)
    expect(extracted?.format).toBe("chatgpt")
    expect(extracted?.jsonText).toBe(chatgptJson)
  })

  it("extracts from a nested path inside the ZIP", () => {
    const zipped = zipSync({ "export/conversations.json": strToU8(claudeJson) })
    const extracted = extractConversationsJSON(zipped)
    expect(extracted?.format).toBe("claude")
  })

  it("passes raw JSON bytes through", () => {
    const extracted = extractConversationsJSON(strToU8(claudeJson))
    expect(extracted?.format).toBe("claude")
    expect(extracted?.jsonText).toBe(claudeJson)
  })

  it("returns null on unrecognized bytes", () => {
    expect(extractConversationsJSON(new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]))).toBeNull()
  })
})

describe("parseExport", () => {
  it("end-to-end parses a ZIP-wrapped ChatGPT export", () => {
    const zipped = zipSync({ "conversations.json": strToU8(chatgptJson) })
    const result = parseExport(zipped)
    expect(result.format).toBe("chatgpt")
    expect(result.conversations).toHaveLength(1)
  })

  it("end-to-end parses raw Claude JSON", () => {
    const result = parseExport(strToU8(claudeJson))
    expect(result.format).toBe("claude")
    expect(result.conversations).toHaveLength(1)
  })

  it("returns unknown for garbage input", () => {
    const result = parseExport(new Uint8Array([0, 0, 0, 0]))
    expect(result.format).toBe("unknown")
    expect(result.conversations).toEqual([])
  })
})
