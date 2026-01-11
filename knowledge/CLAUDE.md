# Machina Knowledge

This folder contains all knowledge needed to set up, maintain, and update Machina.

**This is an AI-native installer.** Claude reads this folder and executes the
appropriate procedures. The knowledge IS the installer.

## For Setup

Read `setup/README.md` and follow the sequence. Ask the user which capabilities they
want, then install and verify.

## For Updates

Read `update/README.md` and follow the appropriate procedure (local, remote, or self).

## For Troubleshooting

Read `maintenance/troubleshooting.md` for common issues and fixes.

## Structure

```
knowledge/
├── product/           # Vision, architecture, boundaries
│   ├── vision.md     # What machina is, why it exists
│   └── architecture.md # How components connect
│
├── setup/            # Installation procedures
│   ├── README.md     # Overview and sequence
│   ├── 01-prerequisites.md
│   ├── 02-core-install.md
│   ├── components/   # Per-component setup
│   ├── 04-launchd.md
│   └── 05-verification.md
│
├── update/           # Update procedures
│   ├── local.md      # User-initiated
│   ├── remote.md     # Cloud-triggered
│   └── self.md       # Scheduled
│
├── maintenance/      # Ongoing care
│   └── troubleshooting.md
│
└── reference/        # Research findings
    └── README.md     # Analysis of existing solutions
```

## Philosophy

Traditional installers follow steps blindly and break on edge cases.

Machina's knowledge describes **goals and verification criteria**. Claude understands
the goal, assesses the current system, adapts to edge cases, and verifies success.

When something fails, Claude can debug and fix it. When something is ambiguous, Claude
can ask the user. This is fundamentally more robust than scripted installation.
