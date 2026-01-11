# Local Update

User-initiated update via Claude Code.

## Trigger

User opens Claude Code in ~/machina and says "Update machina"

## Procedure

### 1. Update Knowledge Repo

```bash
cd ~/machina
git fetch origin
git pull origin main
```

**If conflicts**: Report to user, don't auto-resolve.

### 2. Update Component Repos

For each component in `~/machina/components/`:

```bash
cd ~/machina/components/apple-mcp
git fetch origin
git pull origin main
bun install  # In case dependencies changed

cd ~/machina/components/whatsapp-mcp
git fetch origin
git pull origin main
cd whatsapp-bridge && go build -o whatsapp-bridge
```

### 3. Update Gateway

Gateway is generated, not cloned. Check if gateway.md has changed:

```bash
cd ~/machina
git diff HEAD~1 knowledge/setup/components/gateway.md
```

If changed, may need to regenerate gateway code.

### 4. Restart Services

```bash
launchctl stop com.machina.gateway
launchctl stop com.machina.whatsapp
launchctl start com.machina.whatsapp
launchctl start com.machina.gateway
```

### 5. Verify

Run verification checks from `../setup/05-verification.md`:

```bash
curl http://localhost:8080/health
```

### 6. Report Status

Tell user:

- What was updated (list changed files/commits)
- Current version (from CHANGELOG.md)
- Verification result

## Rollback

If update breaks something:

```bash
# Rollback knowledge
cd ~/machina
git checkout HEAD~1

# Rollback component
cd ~/machina/components/apple-mcp
git checkout HEAD~1
bun install
```

Then restart services.

## When to Update

- New features announced
- Security fixes
- Bug reports you've encountered
- Periodically (weekly?) to stay current
