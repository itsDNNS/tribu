function parseDateRelease(version) {
  if (!version) return null;
  const value = String(version).trim().replace(/^v/i, '');
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[.-]|$)/);
  if (!match) return null;
  const parts = match.slice(1).map((part) => Number(part));
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (
    date.getUTCFullYear() !== parts[0]
    || date.getUTCMonth() !== parts[1] - 1
    || date.getUTCDate() !== parts[2]
  ) {
    return null;
  }
  return { type: 'date', value: match[0].replace(/[.-]$/, ''), parts };
}

function parseSemverRelease(version) {
  if (!version) return null;
  const match = String(version).trim().replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { type: 'semver', value: match.slice(1).join('.'), parts: match.slice(1).map((part) => Number(part)) };
}

function parseRelease(version) {
  return parseDateRelease(version) || parseSemverRelease(version);
}

export function extractReleaseVersion(version) {
  const release = parseRelease(version);
  return release ? release.value : null;
}

export function compareReleaseVersions(left, right) {
  const leftRelease = parseRelease(left);
  const rightRelease = parseRelease(right);
  if (!leftRelease || !rightRelease || leftRelease.type !== rightRelease.type) return 0;
  const leftParts = leftRelease.parts;
  const rightParts = rightRelease.parts;
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
  return parseRelease(value) ? `v${value}` : value;
}
