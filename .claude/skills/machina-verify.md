# Machina Verify

Test all Machina capabilities to verify the installation is working.

## When to Use

- After running "set up machina"
- After running "update machina"
- When troubleshooting capability issues
- When user asks to verify or test machina

## Invocation

User says: `/machina-verify` or "verify machina" or "test machina capabilities"

## Process

Run these tests in sequence, reporting results as you go:

### 1. Gateway Health

```bash
curl -s http://localhost:8080/health
```

Expected: `{"status":"ok"...}`

### 2. Reminders Test

Create a test reminder, verify it exists, delete it:

```bash
osascript -e '
tell application "Reminders"
  set targetList to list "Reminders"
  make new reminder in targetList with properties {name:"machina-verify-test", body:"Safe to delete"}
end tell'
```

Then verify:

```bash
osascript -e '
tell application "Reminders"
  set targetList to list "Reminders"
  return (count of (reminders in targetList whose name is "machina-verify-test")) as text
end tell'
```

Then delete:

```bash
osascript -e '
tell application "Reminders"
  set targetList to list "Reminders"
  delete (first reminder in targetList whose name is "machina-verify-test")
end tell'
```

### 3. Notes Test

Create a test note, verify it exists, delete it:

```bash
osascript -e '
tell application "Notes"
  set targetFolder to folder "Notes"
  make new note in targetFolder with properties {name:"machina-verify-test", body:"Safe to delete"}
end tell'
```

Then verify and delete similarly.

### 4. Messages Test

Read recent messages (safe, no sending):

```bash
sqlite3 ~/Library/Messages/chat.db "SELECT text FROM message ORDER BY date DESC LIMIT 1"
```

### 5. Contacts Test

Count contacts to verify access:

```bash
osascript -e 'tell application "Contacts" to return (count of people) as text'
```

## Output Format

Report results like:

```
Machina Verification Results: X/5 passed

✅ Gateway: Health endpoint responding
✅ Reminders: Create/verify/delete worked
✅ Notes: Create/verify/delete worked
✅ Messages: Can read messages
✅ Contacts: Can access contacts (142 found)

🎉 All capabilities working!
```

Or if failures:

```
⚠️ Some capabilities need attention.
Check System Preferences → Privacy & Security → Automation
```

## Always Clean Up

If any test item was created, always attempt to delete it even if verification failed.
