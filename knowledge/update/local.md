# Local Update

User-initiated update via Claude Code.

## Trigger

User opens Claude Code in ~/machina and says "Update machina"

## Process

1. Pull latest from main branch
2. Update dependencies if package.json changed
3. Restart the server process
4. Verify health endpoint responds
5. Report what changed

## Via MCP (Remote)

AI agents can also trigger updates via the `system_update` operation:

```
machina(action='system_update')
```

This pulls latest, updates deps, and reports changes. Requires server restart to apply.

## Rollback

If update breaks something, check git log for the previous working commit and reset to it.

## When to Update

- New features announced
- Security fixes
- Bug reports encountered
- Periodically to stay current
