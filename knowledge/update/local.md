# Local Update

User-initiated update via Claude Code.

## Trigger

User opens Claude Code in ~/machina and says "Update machina"

## Process

1. **Pull knowledge repo** - Fetch and pull latest from main. Report conflicts if any.

2. **Update machina-mcp** - Run `bun update -g machina-mcp` to get latest version.

3. **Update apple-mcp** - Run `bun update -g apple-mcp` if installed globally.

4. **Restart services** - Stop and start the LaunchD services.

5. **Verify** - Run health checks, confirm services are working.

6. **Report** - Tell user what was updated, current version, verification result.

## Rollback

If update breaks something, install previous version:

```bash
bun add -g machina-mcp@0.1.0
```

Then restart services.

## When to Update

- New features announced
- Security fixes
- Bug reports encountered
- Periodically to stay current
