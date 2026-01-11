# Apple Services Setup (apple-mcp)

This component provides access to native Apple apps: Messages, Mail, Calendar, Notes,
Reminders, Contacts, and Maps.

## Source

Repository: https://github.com/supermemoryai/apple-mcp
Location: `~/machina/components/apple-mcp`
Status: Archived (stable, complete)

## Installation

```bash
cd ~/machina/components/apple-mcp
bun install
```

## Configuration

apple-mcp works out of the box. No configuration file needed.

## Testing Each Capability

### Messages (iMessage)

**Test read**:

```bash
cd ~/machina/components/apple-mcp
bun run test:messages
```

Or manually via AppleScript:

```bash
osascript -e 'tell application "Messages" to get name of every chat'
```

**Expected**: List of chat names (or empty if no chats)

**Common issues**:

- "Not authorized to send Apple events": Grant Automation permission
- Empty result: Make sure Messages app has been opened at least once

### Contacts

**Test**:

```bash
osascript -e 'tell application "Contacts" to get name of every person'
```

**Expected**: List of contact names

### Calendar

**Test**:

```bash
osascript -e 'tell application "Calendar" to get name of every calendar'
```

**Expected**: List of calendar names

### Mail

**Test**:

```bash
osascript -e 'tell application "Mail" to get name of every account'
```

**Expected**: List of email account names

### Notes

**Test**:

```bash
osascript -e 'tell application "Notes" to get name of every note'
```

**Expected**: List of note titles

### Reminders

**Test**:

```bash
osascript -e 'tell application "Reminders" to get name of every list'
```

**Expected**: List of reminder list names

## Permissions Required

1. **Automation**: Allow terminal to control each app
   - First AppleScript call will prompt
   - Or: System Preferences → Privacy & Security → Automation

2. **Full Disk Access** (optional but recommended):
   - Enables direct SQLite access for faster queries
   - Required for reading ~/Library/Messages/chat.db

## Running as Service

apple-mcp runs as a Bun process. For production, use LaunchD (see `../04-launchd.md`).

**Manual start for testing**:

```bash
cd ~/machina/components/apple-mcp
bun run start
```

## Integration with Gateway

The gateway imports apple-mcp utilities directly:

```typescript
import { sendMessage } from "../apple-mcp/utils/messages";
import { searchContacts } from "../apple-mcp/utils/contacts";
```

See `gateway.md` for how the gateway routes requests to apple-mcp.

## Troubleshooting

### "Not authorized to send Apple events"

1. Open System Preferences → Privacy & Security → Automation
2. Find Terminal (or Claude Desktop)
3. Enable checkboxes for Messages, Mail, Calendar, etc.

### AppleScript timeout

Some operations are slow (especially first run). apple-mcp has built-in timeouts:

- Default: 30 seconds per operation
- Can be slow if app hasn't been opened recently

**Fix**: Open the app manually once, then try again.

### "No such file or directory" for database

If accessing ~/Library/Messages/chat.db fails:

1. Grant Full Disk Access to Terminal
2. Close and reopen Terminal
3. Try again

### Messages not sending

Verify:

1. iMessage is enabled in Messages → Preferences → iMessage
2. You're signed into iCloud
3. The recipient is a valid iMessage recipient (try sending manually first)
