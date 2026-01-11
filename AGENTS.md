# Machina

AI-native orchestrator for Mac capabilities. This repo is knowledge Claude reads to set
up, maintain, and update Mac systems for AI agent access.

## Procedures

**Setup:** Read `knowledge/setup/` → assess system → ask user which capabilities →
install and verify.

**Updates:** Read `knowledge/update/` → pull latest → apply changes.

**Maintenance:** Read `knowledge/maintenance/` for health checks and troubleshooting.

## Key Insight

The knowledge folder IS the installer. No bash scripts. Claude reads procedures,
adapts to edge cases, and verifies success.

## Key Directories

- `knowledge/product/` - Vision, architecture, boundaries
- `knowledge/setup/` - Installation procedures
- `knowledge/update/` - Update and self-update procedures
- `knowledge/maintenance/` - Health checks, troubleshooting
- `knowledge/reference/` - Analysis of component repos we depend on
