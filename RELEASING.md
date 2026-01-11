# Releasing Machina

This documents the release process for Machina maintainers.

## Versioning

Machina uses [Semantic Versioning](https://semver.org/):

- **MAJOR**: Breaking changes to knowledge structure or APIs
- **MINOR**: New capabilities, non-breaking changes
- **PATCH**: Bug fixes, documentation improvements

Tags use `v` prefix: `v0.1.0`, `v1.0.0`, etc.

## Source of Truth

**GitHub Releases are the canonical changelog.** The `VERSION` file tracks the current
version locally. The `CHANGELOG.md` file is deprecated in favor of release notes.

## Release Process

### 1. Update VERSION

```bash
echo "0.2.0" > VERSION
```

### 2. Commit the version bump

```bash
git add VERSION
git commit -m "Bump version to 0.2.0"
git push origin main
```

### 3. Create the release

```bash
gh release create v0.2.0 \
  --title "v0.2.0: Short description" \
  --notes "## What's New

- Feature one
- Feature two

## Fixes

- Fixed thing

## Breaking Changes

- None"
```

Or use `--generate-notes` to auto-generate from commits:

```bash
gh release create v0.2.0 --title "v0.2.0" --generate-notes
```

### 4. Verify

```bash
# Check release exists
gh release view v0.2.0

# Verify API returns it
curl -s https://api.github.com/repos/TechNickAI/machina/releases/latest | jq .tag_name
```

## How Machines Check for Updates

Machina instances query the GitHub Releases API:

```bash
curl -s https://api.github.com/repos/TechNickAI/machina/releases/latest | jq -r .tag_name
```

This returns the latest non-prerelease, non-draft release tag (e.g., `v0.2.0`).

Compare to local version:

```bash
LOCAL=$(cat ~/machina/VERSION)
REMOTE=$(curl -s https://api.github.com/repos/TechNickAI/machina/releases/latest | jq -r '.tag_name | ltrimstr("v")')

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "Update available: $LOCAL -> $REMOTE"
fi
```

## Pre-releases

For testing before official release:

```bash
gh release create v0.2.0-rc.1 --prerelease --title "v0.2.0 Release Candidate 1"
```

Pre-releases don't appear in `/releases/latest` - they require explicit opt-in.

## Quick Reference

| Action                   | Command                                       |
| ------------------------ | --------------------------------------------- |
| List releases            | `gh release list`                             |
| View release             | `gh release view v0.1.0`                      |
| Delete release           | `gh release delete v0.1.0 --yes`              |
| Check latest             | `gh release view --json tagName -q .tagName`  |
| Download release tarball | `gh release download v0.1.0 --archive=tar.gz` |
