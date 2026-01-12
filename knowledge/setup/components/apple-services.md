# Apple Services

Access to native Apple apps via AppleScript, built directly into the gateway.

## Capabilities

- **Messages**: Send, read, search iMessages (SQLite + AppleScript)
- **Notes**: Create, search, list notes (AppleScript)
- **Reminders**: Create, list, complete reminders (AppleScript)
- **Contacts**: Search, lookup contacts (AppleScript)

## Implementation

The gateway executes AppleScript directly via `osascript` subprocess. Messages are read
from SQLite (`~/Library/Messages/chat.db`) for better performance.

No external dependencies or separate services required.

## Permissions Required

1. **Automation**: Terminal must be allowed to control each app. First AppleScript call
   triggers a permission prompt.

2. **Full Disk Access**: Required for reading `~/Library/Messages/chat.db`.
   Configure in System Preferences → Privacy & Security → Full Disk Access.

## Testing

Run the `npm run permissions` script to trigger all permission prompts at once.

Verify by calling operations via MCP:

- `contacts_search` - should list matching contacts
- `messages_recent` - should show recent iMessages
- `notes_list` - should list notes
- `reminders_list` - should list reminders

## Troubleshooting

### "Not authorized to send Apple events"

Automation permission not granted. Check System Preferences → Privacy & Security →
Automation.

### AppleScript timeout

Some operations are slow on first run. Open the target app manually first.

### Messages not sending

Verify iMessage is enabled and you're signed into iCloud.

### "Operation not permitted" for chat.db

Full Disk Access not granted, or Terminal needs restart after granting.
