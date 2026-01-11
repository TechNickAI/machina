# Reference Analysis

This folder documents our research into existing Mac MCP servers and automation tools.

## Analyzed Repos

These repos are cloned to `/Users/nick/src/reference/` (not part of machina repo):

| Repo                             | Purpose                  | Our Use            |
| -------------------------------- | ------------------------ | ------------------ |
| TechNickAI/apple-mcp             | Apple native apps        | Forked as core     |
| lharries/whatsapp-mcp            | WhatsApp messaging       | Use directly       |
| steipete/macos-automator-mcp     | 500+ AppleScript recipes | Reference          |
| wonderwhy-er/DesktopCommanderMCP | Terminal/filesystem      | Future integration |
| baryhuang/mcp-remote-macos-use   | VNC-based remote         | Studied, not using |
| 54yyyu/pyapple-mcp               | Python implementation    | Reference          |

## Key Findings

### apple-mcp (Core Foundation)

**Quality**: Excellent (8,300 lines, 100+ tests, production ready)

**Capabilities**:

- Messages: Send, read, schedule, check unread
- Mail: Send, search, read, list accounts
- Calendar: Create, search, list events
- Notes: Create, search, list
- Reminders: Create, list, search
- Contacts: Search, lookup
- Maps: Search, directions, guides

**Architecture**: TypeScript + AppleScript via osascript subprocess

**Gap**: Local only - no remote access

**Why we use it**: Best-in-class Apple integration, well-tested, MIT licensed

### whatsapp-mcp (WhatsApp Support)

**Quality**: Good (stable, actively maintained)

**Architecture**: Go bridge (WhatsApp Web protocol) + Python MCP layer

**Capabilities**:

- Send/receive messages
- Media support (images, video, voice)
- Contact/chat search
- Message history

**Gap**: Separate from Apple ecosystem

**Why we use it**: Only viable WhatsApp integration, already has HTTP API

### macos-automator-mcp (Recipe Library)

**Quality**: Good (500+ recipes, well-organized)

**Purpose**: Discovery-focused - "how do I do X with AppleScript?"

**Why we reference it**: Great AppleScript examples, not a core dependency

### DesktopCommanderMCP (Future)

**Quality**: Good (comprehensive terminal/file access)

**Purpose**: Terminal commands, file operations, process management

**Gap**: No Apple-native integration

**Why future**: Could add for terminal/file capabilities

### mcp-remote-macos-use (Studied, Not Using)

**Quality**: Beta (works but limited)

**Purpose**: VNC-based remote Mac control

**Problems**:

- 512-bit DH encryption (weak)
- Pixel-level control (slow, fragile)
- ~500ms per action
- No semantic understanding

**Why not using**: VNC is wrong paradigm for our use case. We want API-level
access, not screen automation.

### pyapple-mcp (Reference)

**Quality**: Beta (no tests, fragile parsing)

**Purpose**: Python alternative to apple-mcp

**Why reference only**: TypeScript (apple-mcp) is higher quality

## Architecture Patterns Learned

### Pattern 1: AppleScript Bridge

```
MCP Server → osascript subprocess → Native App
```

Used by: apple-mcp, macos-automator-mcp, pyapple-mcp

**Pros**: Full access to any app with scripting dictionary
**Cons**: ~100-200ms latency per call, error handling is tricky

### Pattern 2: Database Direct Access

```
MCP Server → SQLite query → ~/Library/*.db
```

Used by: whatsapp-mcp, pyapple-mcp (for some features)

**Pros**: Fast queries, structured data
**Cons**: Requires Full Disk Access, read-only (can't send via DB)

### Pattern 3: External Protocol Bridge

```
MCP Server → HTTP → Go/Python Bridge → External API
```

Used by: whatsapp-mcp

**Pros**: Separates concerns, bridge handles protocol complexity
**Cons**: Two-language complexity, session management

## Decision: What We're Building

Based on this research:

1. **Fork apple-mcp** - It's the best foundation for Apple services
2. **Use whatsapp-mcp directly** - No need to rewrite working code
3. **Add HTTP gateway** - For remote access (the missing piece)
4. **Add progressive disclosure** - Reduce tool sprawl (mcp-hubby pattern)

We're not reinventing - we're integrating and adding the glue.
