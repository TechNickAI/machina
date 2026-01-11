# Troubleshooting

Common issues and how to resolve them.

## Service Issues

### Gateway not responding

**Symptom**: `curl localhost:8080/health` fails

**Check**:

```bash
launchctl list | grep machina.gateway
```

If no PID shown, service isn't running.

**Fix**:

```bash
# Check logs
cat ~/machina/logs/gateway.error.log

# Try starting manually
cd ~/machina/components/gateway
source ~/machina/config/.env
bun run src/index.ts

# If manual works, reload LaunchD
launchctl unload ~/Library/LaunchAgents/com.machina.gateway.plist
launchctl load ~/Library/LaunchAgents/com.machina.gateway.plist
```

### Service keeps crashing

**Symptom**: Service restarts repeatedly, logs show errors

**Check**:

```bash
tail -50 ~/machina/logs/gateway.error.log
```

**Common causes**:

- Missing environment variable (API key not set)
- Wrong path in plist file
- Dependency not installed
- Port already in use

**Fix for port conflict**:

```bash
lsof -i :8080
# Kill the conflicting process or change port in gateway config
```

### WhatsApp disconnected

**Symptom**: WhatsApp messages not sending/receiving

**Check**:

```bash
tail ~/machina/logs/whatsapp.log
```

Look for "disconnected" or "session expired" messages.

**Fix**:

```bash
# Stop the bridge
launchctl stop com.machina.whatsapp

# Delete session (will require re-auth)
rm -rf ~/machina/components/whatsapp-mcp/whatsapp-bridge/store/

# Start bridge
launchctl start com.machina.whatsapp

# Scan new QR code
tail -f ~/machina/logs/whatsapp.log
# QR code appears in logs or terminal
```

## Permission Issues

### "Not authorized to send Apple events"

**Symptom**: AppleScript operations fail with authorization error

**Fix**:

1. Open System Preferences → Privacy & Security → Automation
2. Find Terminal (or the app running machina)
3. Enable checkboxes for Messages, Mail, Calendar, etc.
4. If not listed, run the AppleScript once to trigger the prompt

### "Operation not permitted" for database

**Symptom**: Can't read ~/Library/Messages/chat.db

**Fix**:

1. System Preferences → Privacy & Security → Full Disk Access
2. Add Terminal (or the app running machina)
3. Close and reopen Terminal
4. Test: `ls ~/Library/Messages/chat.db`

### Automation prompts keep appearing

**Symptom**: macOS keeps asking for permission

This happens when multiple apps try to control the same target.

**Fix**:

- Grant permission to the specific app that runs machina (not Terminal)
- If using LaunchD, the service runs as your user - permissions should persist

## Installation Issues

### Bun not found

**Symptom**: `bun: command not found`

**Fix**:

```bash
# Install Bun
brew install oven-sh/bun/bun

# Or verify path
which bun
# Add to PATH if needed
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Go not found (WhatsApp)

**Symptom**: `go: command not found` when building WhatsApp bridge

**Fix**:

```bash
brew install go
# Verify
go version
```

### apple-mcp build fails

**Symptom**: `bun install` or `bun run build` fails

**Check**:

```bash
cd ~/machina/components/apple-mcp
bun install 2>&1
```

**Common fixes**:

- Update Bun: `bun upgrade`
- Clear cache: `rm -rf node_modules && bun install`
- Check TypeScript version matches expected

## Network Issues

### Can't reach from Tailscale

**Symptom**: Remote curl to Tailscale IP fails

**Check**:

```bash
# On Mac
tailscale status

# Verify IP
tailscale ip -4
```

**Fix**:

- Ensure Tailscale is connected on both devices
- Check firewall isn't blocking port 8080
- Verify gateway is listening on 0.0.0.0, not just localhost

### API key rejected

**Symptom**: `{"error": "Invalid API key"}`

**Check**:

```bash
source ~/machina/config/.env
echo $MACHINA_API_KEY
```

**Fix**:

- Verify key matches what gateway was started with
- Check for trailing newlines or spaces in .env file
- Restart gateway after changing key

## Update Issues

### Git pull fails

**Symptom**: Conflicts or errors when updating

**Check**:

```bash
cd ~/machina
git status
```

**Fix for uncommitted changes**:

```bash
# Stash local changes
git stash
git pull origin main
git stash pop  # Reapply changes
```

**Fix for conflicts**:

```bash
# Reset to remote (loses local changes)
git fetch origin
git reset --hard origin/main
```

### Component update breaks things

**Symptom**: After update, service won't start

**Rollback**:

```bash
cd ~/machina/components/apple-mcp
git log --oneline -5  # Find previous commit
git checkout <previous-commit-hash>
bun install
```

Then restart service and report issue.

## Diagnostic Commands

```bash
# Check all services
launchctl list | grep machina

# View recent logs
tail -50 ~/machina/logs/gateway.log
tail -50 ~/machina/logs/whatsapp.log

# Check disk space
df -h ~

# Check processes
ps aux | grep -E 'bun|whatsapp-bridge'

# Test AppleScript
osascript -e 'tell application "System Events" to return name of first process'

# Check macOS version
sw_vers

# Check Full Disk Access
sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message LIMIT 1;" 2>&1
```

## Getting Help

If troubleshooting doesn't resolve the issue:

1. Gather diagnostics:
   - macOS version (`sw_vers`)
   - Error logs (`cat ~/machina/logs/*.error.log`)
   - Service status (`launchctl list | grep machina`)

2. Open issue: https://github.com/TechNickAI/machina/issues

3. Include:
   - What you were trying to do
   - What happened instead
   - Diagnostic output
