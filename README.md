# chat-export-parser

Parse ChatGPT and Claude.ai account exports into a normalized conversation format.

## What it does

Takes the bytes of an account export (either the raw `conversations.json` or the ZIP archive it ships inside of), detects the vendor, and returns a flat list of `Conversation` objects with ordered messages, timestamps, and normalized roles.

Malformed entries are counted and dropped rather than throwing. No conversation content is logged.

## Install

```
npm install chat-export-parser
```

Requires Node 18 or newer. The only runtime dependency is `fflate` for ZIP extraction.

## Usage

### One-call entry point

Auto-detects the container (ZIP or raw JSON) and the vendor (ChatGPT or Claude).

```ts
import { readFile } from "node:fs/promises"
import { parseExport } from "chat-export-parser"

const bytes = await readFile("chatgpt-export.zip")
const result = parseExport(new Uint8Array(bytes))

console.log(result.format)               // "chatgpt"
console.log(result.conversations.length) // e.g. 128
console.log(result.skipped)              // e.g. 2
```

### Vendor-specific parsers

Use these when you already have the JSON text and know the vendor.

```ts
import { readFile } from "node:fs/promises"
import { parseChatGPTExport, parseClaudeExport } from "chat-export-parser"

const chatgptJson = await readFile("conversations.json", "utf8")
const chatgptResult = parseChatGPTExport(chatgptJson)

const claudeJson = await readFile("claude-conversations.json", "utf8")
const claudeResult = parseClaudeExport(claudeJson)
```

### Container extraction only

Extract and identify without parsing.

```ts
import { extractConversationsJSON } from "chat-export-parser"

const extracted = extractConversationsJSON(bytes)
if (extracted) {
  console.log(extracted.format)   // "chatgpt" | "claude" | "unknown"
  console.log(extracted.jsonText) // raw conversations.json text
}
```

## Supported formats

| Vendor    | Container             | Entry file           |
| --------- | --------------------- | -------------------- |
| ChatGPT   | `.zip` or raw `.json` | `conversations.json` |
| Claude.ai | `.zip` or raw `.json` | `conversations.json` |

For ChatGPT exports, the parser walks the message tree from `current_node` upward via parent pointers, then reverses to reconstruct the canonical thread the user last saw. Alternate branches are dropped.

For Claude exports, both the older `text` shape and the newer `content: [{ type: "text", text }]` shape are supported.

## Return shape

```ts
interface ParsedExport {
  format: "chatgpt" | "claude" | "unknown"
  conversations: Conversation[]
  skipped: number
}

interface Conversation {
  id: string
  title: string
  format: "chatgpt" | "claude" | "unknown"
  createdAt?: string
  updatedAt?: string
  messages: ConversationMessage[]
  charCount: number
}

interface ConversationMessage {
  role: "user" | "assistant" | "system" | "other"
  text: string
  createdAt?: string
}
```

Timestamps are ISO 8601 when the source export includes them.

## License

MIT
