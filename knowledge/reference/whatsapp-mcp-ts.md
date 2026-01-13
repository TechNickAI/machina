# WhatsApp MCP TypeScript (whatsapp-mcp-ts)

WhatsApp integration via the Baileys library (WhatsApp Web protocol).

## Source & Rationale

**Fork**: `TechNickAI/whatsapp-mcp-ts` (forked from `jlucaso1/whatsapp-mcp-ts`)

**Why fork?**

- Original: stdio-only MCP server with per-call WhatsApp connections
- Fork: HTTP service wrapper for Machina gateway integration, persistent connection

**Library**: [Baileys](https://github.com/WhiskeySockets/Baileys) - TypeScript WhatsApp Web API

- No official API, reverse-engineered protocol
- Requires QR code auth every ~20 days
- Real-time message sync to local SQLite

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                       Machina Gateway                            │
│                        (port 9900)                               │
├──────────────────────────────────────────────────────────────────┤
│  READS: Direct SQLite     │  WRITES: HTTP POST                   │
│  (fast, no network)       │  (requires live WebSocket)           │
└──────────────┬────────────┴────────────────┬─────────────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              WhatsApp Service (server.ts)                        │
│                        port 9901                                 │
├──────────────────────────────────────────────────────────────────┤
│  Baileys (WebSocket) ◄──► WhatsApp Web servers                   │
│  SQLite sync         ──► data/whatsapp.db                        │
└──────────────────────────────────────────────────────────────────┘
```

**Why this split?**

- **Reads via SQLite**: Instant, works during connection hiccups, no rate limits
- **Sends via HTTP**: Requires live WebSocket that only the service maintains
- **Decoupled**: Gateway can restart without breaking WhatsApp session

## Database Schema

SQLite at `~/machina/components/whatsapp-mcp-ts/data/whatsapp.db`:

```sql
-- Conversations (individual + groups)
CREATE TABLE chats (
  jid TEXT PRIMARY KEY,      -- '15551234567@s.whatsapp.net' or '120363...@g.us'
  name TEXT,                 -- Display name (contact name or group name)
  last_message_time INTEGER  -- Unix timestamp (seconds)
);

-- Messages
CREATE TABLE messages (
  id TEXT PRIMARY KEY,       -- WhatsApp message ID
  chat_jid TEXT,             -- FK to chats.jid
  sender TEXT,               -- JID of sender (for groups)
  content TEXT,              -- Message text
  timestamp INTEGER,         -- Unix timestamp (seconds)
  is_from_me INTEGER         -- 1 = sent by you, 0 = received
);

-- Contacts (synced from phone)
CREATE TABLE contacts (
  jid TEXT PRIMARY KEY,      -- '15551234567@s.whatsapp.net'
  name TEXT,                 -- Saved contact name
  notify TEXT,               -- Push notification name
  phone_number TEXT          -- E.164 format ('+15551234567')
);
```

## JID Format (Critical for Usage)

WhatsApp identifies users and groups with JIDs (Jabber IDs):

| Type       | Format                             | Example                      |
| ---------- | ---------------------------------- | ---------------------------- |
| Individual | `<country><number>@s.whatsapp.net` | `15551234567@s.whatsapp.net` |
| Group      | `<id>@g.us`                        | `120363023456789@g.us`       |

**Users cannot guess JIDs.** Discovery workflow:

1. **Find a person**: `whatsapp_contacts(query='John')` → returns JID
2. **Find a group**: `whatsapp_chats()` → lists groups with JIDs
3. **Then message**: `whatsapp_send(to='<jid>', message='...')`

Phone numbers don't work directly - must use JID format.

## Operations

### Discovery Operations

| Operation           | Purpose            | When to Use                      |
| ------------------- | ------------------ | -------------------------------- |
| `whatsapp_status`   | Check connection   | Before sending, after errors     |
| `whatsapp_contacts` | Find person JIDs   | Know name, need JID              |
| `whatsapp_chats`    | List conversations | Find groups, see recent activity |

### Read Operations

| Operation               | Purpose               | When to Use                 |
| ----------------------- | --------------------- | --------------------------- |
| `whatsapp_messages`     | Read chat history     | Need specific conversation  |
| `whatsapp_search`       | Find messages by text | Looking for keywords        |
| `whatsapp_chat_context` | LLM-formatted history | AI analysis of conversation |

### Write Operations

| Operation       | Purpose      | When to Use               |
| --------------- | ------------ | ------------------------- |
| `whatsapp_send` | Send message | Have JID, want to message |

### Advanced

| Operation          | Purpose        | When to Use                 |
| ------------------ | -------------- | --------------------------- |
| `whatsapp_raw_sql` | Custom queries | Complex queries not covered |

## Workflow Patterns

### "Message someone by name"

```
1. whatsapp_contacts(query='John Smith')
   → [{jid: '15551234567@s.whatsapp.net', name: 'John Smith'}]

2. whatsapp_send(to='15551234567@s.whatsapp.net', message='Hey!')
   → Sent
```

### "Check recent conversations"

```
1. whatsapp_chats(limit=10)
   → [{name: 'Work Group', jid: '120363...@g.us', last_message_time: ...}, ...]

2. whatsapp_messages(chatJid='120363...@g.us', limit=20)
   → Last 20 messages
```

### "Find messages about a topic"

```
1. whatsapp_search(query='meeting tomorrow')
   → [{chat_name: 'Work Group', sender: 'Jane', content: 'meeting tomorrow at 3pm'}]
```

### "Analyze a conversation for AI"

```
1. whatsapp_chat_context(chatJid='15551234567@s.whatsapp.net', days=7)
   → LLM-friendly JSON with metadata and message history
```

## Limitations

- **No media download**: Messages with media show metadata but can't retrieve files
- **Session expiry**: Re-auth via QR code every ~20 days
- **No reactions**: Reactions not synced to database
- **No status**: WhatsApp Status not supported
- **Rate limits**: WhatsApp may throttle rapid sends

## Troubleshooting

| Symptom                | Cause                            | Fix                                     |
| ---------------------- | -------------------------------- | --------------------------------------- |
| `status: disconnected` | Session expired or phone offline | Re-scan QR code                         |
| Messages not appearing | Service not running              | Check `launchctl list \| grep whatsapp` |
| Old messages missing   | Historical sync incomplete       | Wait for initial sync (~5 min)          |
| Send fails             | Phone app force-closed           | Open WhatsApp on phone                  |
