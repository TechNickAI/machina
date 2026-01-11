# Machina Updates

Procedures for updating Machina and its components.

## Update Types

| Type       | Trigger             | What Updates           |
| ---------- | ------------------- | ---------------------- |
| **Local**  | User runs Claude    | Knowledge + components |
| **Remote** | API call from cloud | Same as local          |
| **Self**   | Scheduled job       | Knowledge repo only    |

## Quick Update

Open Claude Code in ~/machina and say "Update machina"

Claude will pull latest, rebuild components, restart services, verify.

## Update Procedures

- `local.md` - User-initiated update
- `remote.md` - Cloud-triggered update
- `self.md` - Scheduled self-update

## Version Checking

Current version is in `package.json`.

Check for updates via `git fetch && git log HEAD..origin/main --oneline` or GitHub Releases API.

## Release History

See [GitHub Releases](https://github.com/TechNickAI/machina/releases) for changelog.
