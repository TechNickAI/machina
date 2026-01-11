# Changelog

All notable changes to Machina will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial knowledge structure for AI-native installation
- Setup procedures for apple-mcp integration
- Setup procedures for whatsapp-mcp integration
- HTTP gateway specification with Hono
- LaunchD service configuration
- Update procedures (local, remote, self-update)
- Troubleshooting guide
- Reference analysis of existing Mac MCP servers

## [0.1.0] - 2026-01-11

### Added

- Initial release
- Knowledge-based architecture for AI-native installation
- Vision and architecture documentation
- Setup procedures for:
  - Prerequisites (Homebrew, Bun, Go, permissions)
  - Core installation (cloning repos, configuration)
  - Apple services (iMessage, Mail, Calendar, Notes, Reminders, Contacts)
  - WhatsApp integration
  - HTTP gateway with API key auth
  - LaunchD auto-start
  - Verification checklist
- Update procedures for:
  - Local updates (user-initiated)
  - Remote updates (cloud-triggered)
  - Self-updates (scheduled)
- Maintenance documentation:
  - Troubleshooting guide
  - Diagnostic commands
- Reference documentation capturing research findings

### Architecture Decisions

- **AI-native installation**: Claude Code reads knowledge and executes setup, not bash scripts
- **Fork apple-mcp**: Best foundation for Apple services (8,300 lines, 100+ tests)
- **Use whatsapp-mcp directly**: Proven Go bridge, no need to rewrite
- **HTTP gateway with Hono**: Lightweight, works with Bun
- **LaunchD for services**: Native macOS, auto-restart, boot persistence
- **Tailscale for remote access**: Zero-config VPN, simpler than mTLS
