# Machina

Smart setup and update for Machina. Detects current state and does the right thing.

## When to Use

- User runs `/machina`
- User says "set up machina", "install machina", "update machina"

## Process

### 1. Detect Current State

Check if Machina is already installed by looking for installation artifacts:

```bash
# Check for config file (created during setup)
ls ~/machina/config/.env 2>/dev/null

# Check for LaunchD plist (created during setup)
ls ~/Library/LaunchAgents/com.machina.gateway.plist 2>/dev/null
```

- **If config file exists** → Already installed, do UPDATE
- **If config file doesn't exist** → Not installed, do SETUP

Then check if service is running:

```bash
curl -s http://localhost:8080/health
```

- **If installed but health fails** → Service down, restart it during UPDATE

### 2a. SETUP (Not Installed)

Read and follow `knowledge/setup/README.md`:

1. Verify prerequisites (macOS, Tailscale installed)
2. Ask user which capabilities they want
3. Install Bun and dependencies
4. Trigger permission prompts
5. Generate auth token
6. Start gateway service
7. Configure Tailscale (if selected)
8. Set up LaunchD for auto-start
9. Provide MCP configuration
10. Offer to run `/machina-verify`

**Key**: Must run from Terminal/VNC, not SSH (permission prompts need GUI)

### 2b. UPDATE (Already Installed)

Read and follow `knowledge/update/README.md`:

1. Check for available updates (`git fetch`)
2. If updates available:
   - Pull latest code
   - Update dependencies
   - Restart service
   - Report what changed
3. If no updates: Report already up to date
4. Offer to run `/machina-verify`

## Output

### After Setup

```
Setup complete!

Installed: iMessage, Notes, Reminders, Contacts
Service: Running on port 8080 (PID 12345)
Remote: https://your-mac.tailnet.ts.net/

MCP Config:
{...}

Would you like me to run verification?
```

### After Update

```
Updated from v1.1.0 to v1.2.0

Changes:
- abc1234 Add verification skill
- def5678 Fix robustness issues

Service restarted. Would you like me to run verification?
```
