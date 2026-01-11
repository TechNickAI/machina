# Remote Update

Cloud-triggered update via HTTP API.

## Use Case

Carmenta (or another cloud AI) triggers update on remote Mac without user presence.

## Trigger

POST to gateway with action `system.update`.

## Implementation

Gateway handles `system.update` by spawning Claude to run the local update procedure.

Security considerations:

- Requires valid token
- Log all remote update requests
- Consider rate limiting
- Optionally notify user

## Response

On success: what was updated, new version, verification results.
On failure: error details, logs.

## Fallback

If remote update fails:

- Services should remain running (don't stop before update succeeds)
- Error logged and returned to caller
- User notified if configured

## Scheduling

Remote updates can be scheduled by cloud AI:

- Daily at 3am
- After push to main (webhook)
- Manual via Carmenta
