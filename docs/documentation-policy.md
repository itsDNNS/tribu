# Documentation ownership policy

The GitHub Wiki is the primary documentation entry point for Tribu users, self-hosters, operators, and integrations. Repo-local Markdown should stay small and close to the code unless the content must be versioned with a code change.

## Ownership rule

- **Wiki:** user guides, self-hosting, operations, integrations, troubleshooting, roadmap, changelog, release-oriented usage docs, and reference pages that should be easy to find from GitHub's Wiki tab.
- **Repository Markdown:** README, contributor/developer workflow, security policy, architecture or API notes that need to be reviewed with code, and short pointer pages that preserve existing links.
- **Pointer stubs:** repo pages that used to contain user-facing guides should link to the Wiki and keep major headings when practical so old anchors remain understandable.

## Current inventory

| File or page | Location | Category | Decision |
|--------------|----------|----------|----------|
| `README.md` | Repo | Product overview and quick start | Keep in repo, point prominently to the Wiki for full docs |
| `CONTRIBUTING.md` | Repo | Contributor and local development workflow | Keep in repo because it is code-adjacent |
| `SECURITY.md` | Repo | Security policy and responsible disclosure | Keep in repo because GitHub surfaces it directly |
| `docs/self-hosting.md` | Repo | Self-hosting and operations | Replace detailed copy with a pointer stub to the Wiki guide |
| `docs/home-assistant.md` | Repo | Home Assistant integration setup | Replace detailed copy with a pointer stub to the Wiki guide |
| `Home` | Wiki | Documentation entry point | Make it the primary docs index |
| `Self-Hosting` | Wiki | Installation, configuration, operations, updates, troubleshooting | Primary source of truth |
| `Home Assistant` | Wiki | REST sensors, webhook automations, dashboard card, privacy notes | Primary source of truth |
| `Shared Home Display` | Wiki | Shared display setup and security model | Primary source of truth |
| `Backup & Restore` | Wiki | Backup, restore, storage, and scheduling | Primary source of truth |
| `Single Sign-On (OIDC)` | Wiki | OIDC setup and provider notes | Primary source of truth |
| `Architecture` | Wiki | Architecture overview and module map | Keep in Wiki unless a future contract must be tested with code |
| `Plugin Manifest` | Wiki | Extension reference | Keep in Wiki unless a future manifest schema becomes versioned with tests |
| `Roadmap` | Wiki | Product direction | Keep in Wiki |
| `Changelog` | Wiki | Release history | Keep in Wiki |

## Future documentation changes

1. If the change helps users install, operate, integrate, or troubleshoot Tribu, update the Wiki first.
2. If a repo-local pointer would otherwise become stale, update only the link or short description.
3. If the content is needed for contributors to build, test, review, or safely change code, keep it in the repo.
4. Avoid maintaining the same full guide in both places.
