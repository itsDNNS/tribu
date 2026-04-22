import {
  compareReleaseVersions,
  extractReleaseVersion,
  formatDisplayedVersion,
  hasNewerRelease,
} from '../../lib/version';

describe('version helpers', () => {
  test('extractReleaseVersion pulls the release part from build identifiers', () => {
    expect(extractReleaseVersion('1.4.0-2-g7fd2bc4')).toBe('1.4.0');
    expect(extractReleaseVersion('v1.4.1')).toBe('1.4.1');
    expect(extractReleaseVersion('main')).toBeNull();
  });

  test('compareReleaseVersions compares semantic release triplets', () => {
    expect(compareReleaseVersions('1.4.1', '1.4.0')).toBe(1);
    expect(compareReleaseVersions('1.4.0', '1.4.0-2-g7fd2bc4')).toBe(0);
    expect(compareReleaseVersions('1.3.9', '1.4.0')).toBe(-1);
  });

  test('hasNewerRelease ignores older or equal release bases for latest builds', () => {
    expect(hasNewerRelease('1.4.0-2-g7fd2bc4', '1.4.0')).toBe(false);
    expect(hasNewerRelease('1.4.1-3-gabcdef0', '1.4.0')).toBe(false);
    expect(hasNewerRelease('1.3.0-9-g1234567', '1.4.0')).toBe(true);
  });

  test('formatDisplayedVersion only prefixes semver-like versions', () => {
    expect(formatDisplayedVersion('1.4.0-2-g7fd2bc4+build.412')).toBe('v1.4.0-2-g7fd2bc4+build.412');
    expect(formatDisplayedVersion('v1.4.1')).toBe('v1.4.1');
    expect(formatDisplayedVersion('build.412-gabcdef1')).toBe('build.412-gabcdef1');
    expect(formatDisplayedVersion('main')).toBe('main');
  });
});
