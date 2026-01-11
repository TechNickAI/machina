# Machina Updates

This folder contains procedures for updating Machina and its components.

## Update Types

| Type           | Trigger              | What Updates                     |
| -------------- | -------------------- | -------------------------------- |
| **Local**      | User runs Claude     | Knowledge + components           |
| **Remote**     | API call from cloud  | Same as local                    |
| **Self**       | Scheduled job        | Knowledge repo only              |
| **Components** | Part of local/remote | apple-mcp, whatsapp-mcp, gateway |

## Quick Update (Local)

```bash
cd ~/machina && claude
```

Tell Claude: **"Update machina"**

Claude will:

1. Pull latest knowledge repo
2. Pull latest component repos
3. Rebuild if needed
4. Restart services
5. Verify everything works

## Update Procedures

- `local.md` - User-initiated update
- `remote.md` - Cloud-triggered update
- `self.md` - Scheduled self-update

## Version Checking

Current version: Check `~/machina/CHANGELOG.md`

Check for updates:

```bash
cd ~/machina && git fetch && git log HEAD..origin/main --oneline
```

If output is empty, you're up to date.
