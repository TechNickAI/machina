# Apple Services (apple-mcp)

Access to native Apple apps via AppleScript.

## Source

Repository: `TechNickAI/apple-mcp` (forked from supermemoryai)
Location: `~/machina/components/apple-mcp`

## Capabilities

- **Messages**: Send, read, schedule iMessage
- **Mail**: Send, search, read emails
- **Calendar**: Create, search, list events
- **Notes**: Create, search, list notes
- **Reminders**: Create, list, search reminders
- **Contacts**: Search, lookup contacts

## Installation

Clone the repo. Install dependencies with Bun. Verify build succeeds.

No configuration needed - works out of the box.

## Permissions Required

1. **Automation**: Terminal must be allowed to control each app. First AppleScript call
   triggers a permission prompt.

2. **Full Disk Access** (recommended): Enables direct SQLite access for faster queries.
   Required for reading `~/Library/Messages/chat.db`.

## Testing

Test each capability by running AppleScript to list items from each app (chats, contacts,
calendars, mail accounts, notes, reminder lists).

Success: lists return without "not authorized" errors.

## Integration

The gateway imports apple-mcp utilities directly. See `gateway.md`.

## Troubleshooting

### "Not authorized to send Apple events"

Automation permission not granted. Check System Preferences → Privacy & Security →
Automation.

### AppleScript timeout

Some operations are slow on first run. Open the target app manually first.

### Messages not sending

Verify iMessage is enabled and you're signed into iCloud.
