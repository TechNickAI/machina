# Local Update

User-initiated update via Claude Code.

## Trigger

User opens Claude Code in ~/machina and says "Update machina"

## Process

1. **Pull knowledge repo** - Fetch and pull latest from main. Report conflicts if any.

2. **Update component repos** - For each installed component, pull latest and rebuild.

3. **Check gateway spec** - If gateway.md changed, may need to regenerate gateway code.

4. **Restart services** - Stop and start the LaunchD services.

5. **Verify** - Run health checks, confirm services are working.

6. **Report** - Tell user what was updated, current version, verification result.

## Rollback

If update breaks something, checkout previous commit in affected repo, rebuild,
restart services.

## When to Update

- New features announced
- Security fixes
- Bug reports encountered
- Periodically to stay current
