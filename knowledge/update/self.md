# Self-Update (Scheduled)

Automatic update of Machina knowledge repo via LaunchD schedule.

## Purpose

Keep Machina current without manual intervention. Runs nightly, pulls latest knowledge,
optionally triggers full update if changes detected.

## How It Works

1. **3am daily**: LaunchD triggers the job
2. **Fetch**: Get latest from remote without applying
3. **Check**: Compare local HEAD to remote
4. **If changes**: Invoke Claude to run update
5. **If no changes**: Exit silently

## Setup

Create a LaunchD plist `com.machina.selfupdate` that:

- Runs at 3am daily (StartCalendarInterval)
- Fetches and checks for changes
- Invokes Claude if updates available
- Logs to `~/machina/logs/selfupdate.log`

## Version Checking

Can also check via `npm view machina-mcp version` - compare installed version to latest.
This catches releases even if git history differs.

## Alternative: Pull Only

For manual control over when Claude runs, just pull knowledge without invoking Claude.
Next time user opens Claude, they see the new knowledge.

## Notification

Optionally display macOS notification or notify cloud AI after successful update.

## Disable

Unload the LaunchD plist to disable scheduled updates.
