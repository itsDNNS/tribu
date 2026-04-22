function parseReleaseParts(version) {
  if (!version) return null;
  const match = String(version).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map((part) => Number(part));
}

export function extractReleaseVersion(version) {
  const parts = parseReleaseParts(version);
  return parts ? parts.join('.') : null;
}

export function compareReleaseVersions(left, right) {
  const leftParts = parseReleaseParts(left);
  const rightParts = parseReleaseParts(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] > rightParts[index]) return 1;
    if (leftParts[index] < rightParts[index]) return -1;
  }
  return 0;
}

export function hasNewerRelease(currentVersion, latestReleaseVersion) {
  const currentRelease = extractReleaseVersion(currentVersion);
  const latestRelease = extractReleaseVersion(latestReleaseVersion);
  if (!currentRelease || !latestRelease) return false;
  return compareReleaseVersions(latestRelease, currentRelease) > 0;
}

export function formatDisplayedVersion(version) {
  const value = String(version || '').trim();
  if (!value) return '';
  if (/^v/i.test(value)) return value;
  return extractReleaseVersion(value) ? `v${value}` : value;
}
