# Public copy review checklist

Public-facing copy should be reviewed by a person before release, while automated tests should stay focused on durable contracts.

## Contract tests keep

Required metadata, file links, and asset paths stay automated. Tests should also keep objective setup, security, and integration contracts covered when a broken value would mislead operators or break the public site.

Good automated checks include:

- Open Graph and Twitter metadata exists on the product page.
- Local README and product-page links resolve to files that are actually tracked.
- Public Docker examples keep published images, secret placeholders, and the documented database URL shape.
- Locale strings preserve required caveats such as DAVx5 for Android phone sync and the admin GitHub release-check disclosure.
- Legacy helper-script references do not return after a supported wiki runbook replaces them.

## Human copy review checks

Do not turn normal wording preferences into exact-string tests. Review these manually when changing README, product-page, launch, directory, or support copy:

- The copy is sober, specific, and maintainer-authored in tone.
- It does not mention internal tools, private hosts, prompt mechanics, or review process.
- It does not name competitors or private research sources.
- It avoids unsupported superlatives and absolute privacy claims.
- It avoids em dashes when a simple comma, colon, or sentence split is clearer.
- It uses user-facing product language instead of implementation or provider jargon.

## Claims that need evidence

Before publishing or expanding a public claim, confirm that the claim is backed by a current source:

- Screenshots or product-page assets for visible UI claims.
- README, wiki, or docs for setup and operator claims.
- Tests or source files for security, Docker, PWA, locale, and integration claims.
- Release notes, issues, or app-repository trackers for native app, store, device, or release-readiness claims.

If a claim cannot be verified quickly, soften it, add a caveat, or remove it.

## Release checklist

Before a public docs or launch-surface PR is merged:

- Run the public-surface tests for metadata, links, assets, Docker examples, locale caveats, and release-readiness pointers.
- Read the changed public copy once as a maintainer, not as a test author.
- Confirm changed screenshots or assets are current, public-safe, and not private fixture data.
- Keep dated release evidence in the repository that owns it instead of mirroring it across repositories.
