# Local Update

User-initiated update via Claude Code.

## Trigger

User opens Claude Code in ~/machina and says "Update machina"

## Process

1. **Pull latest** - Fetch and pull latest from main. Report conflicts if any.

```bash
cd ~/machina && git fetch && git pull
```

2. **Update dependencies** - Install any new dependencies.

```bash
bun install
```

3. **Restart server** - Stop existing process and restart.

```bash
pkill -f "bun.*server/index.ts"
export MACHINA_TOKEN=$(cat ~/machina/config/.env | grep MACHINA_TOKEN | cut -d= -f2)
nohup bun run server/index.ts >> ~/machina/logs/gateway.log 2>&1 &
```

4. **Verify** - Check health endpoint.

```bash
curl http://localhost:8080/health
```

5. **Report** - Tell user what was updated, current version, verification result.

## Rollback

If update breaks something, revert to previous commit:

```bash
git log --oneline -5  # Find the commit to revert to
git checkout <commit-hash>
bun install
# Restart server
```

## When to Update

- New features announced
- Security fixes
- Bug reports encountered
- Periodically to stay current
