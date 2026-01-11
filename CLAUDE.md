# Machina

AI-native orchestrator for Mac capabilities. This repo contains knowledge that Claude
reads to set up, maintain, and update Mac systems for AI agent access.

## For Claude Code

**First-time setup:** Read `knowledge/setup/` and follow the procedures to bootstrap
machina on this Mac. Assess current system state, ask the user which capabilities they
want, then install and verify.

**Updates:** Read `knowledge/update/` to pull latest changes and apply them.

**Maintenance:** Read `knowledge/maintenance/` for health checks and troubleshooting.

## Philosophy

This is an AI-native installer. The knowledge folder IS the installer - Claude reads it
and executes the setup. No bash scripts that break on edge cases. Claude adapts,
debugs, and verifies.

## Key Directories

- `knowledge/product/` - Vision, architecture, boundaries
- `knowledge/setup/` - Installation procedures (Claude reads these)
- `knowledge/update/` - Update and self-update procedures
- `knowledge/maintenance/` - Health checks, troubleshooting
- `knowledge/reference/` - Analysis of component repos we depend on

## Versioning

See `CHANGELOG.md` for version history. We use semantic versioning with GitHub releases.
