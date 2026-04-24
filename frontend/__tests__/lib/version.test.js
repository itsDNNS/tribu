import {
  compareReleaseVersions,
  extractReleaseVersion,
  formatDisplayedVersion,
  hasNewerRelease,
} from '../../lib/version';

describe('version helpers', () => {
  test('extractReleaseVersion pulls the release part from build identifiers', () => {
    expect(extractReleaseVersion('2026-04-24.412')).toBe('2026-04-24');
    expect(extractReleaseVersion('v2026-04-24')).toBe('2026-04-24');
    expect(extractReleaseVersion('1.4.0-2-g7fd2bc4')).toBe('1.4.0');
    expect(extractReleaseVersion('v1.4.1')).toBe('1.4.1');
    expect(extractReleaseVersion('2026-99-24.412')).toBeNull();
    expect(extractReleaseVersion('main')).toBeNull();
  });

  test('compareReleaseVersions compares product date releases', () => {
    expect(compareReleaseVersions('2026-04-25', '2026-04-24.412')).toBe(1);
    expect(compareReleaseVersions('v2026-04-24', '2026-04-24.412')).toBe(0);
    expect(compareReleaseVersions('2026-04-23', '2026-04-24')).toBe(-1);
  });

  test('compareReleaseVersions compares semantic release triplets for legacy releases', () => {
    expect(compareReleaseVersions('1.4.1', '1.4.0')).toBe(1);
    expect(compareReleaseVersions('1.4.0', '1.4.0-2-g7fd2bc4')).toBe(0);
    expect(compareReleaseVersions('1.3.9', '1.4.0')).toBe(-1);
  });

  test('hasNewerRelease ignores older or equal release bases for latest builds', () => {
    expect(hasNewerRelease('2026-04-24.412', 'v2026-04-24')).toBe(false);
    expect(hasNewerRelease('2026-04-24.412', 'v2026-04-25')).toBe(true);
    expect(hasNewerRelease('1.4.0-2-g7fd2bc4', '1.4.0')).toBe(false);
    expect(hasNewerRelease('1.4.1-3-gabcdef0', '1.4.0')).toBe(false);
    expect(hasNewerRelease('1.3.0-9-g1234567', '1.4.0')).toBe(true);
  });

  test('formatDisplayedVersion prefixes product and legacy release versions', () => {
    expect(formatDisplayedVersion('2026-04-24.412')).toBe('v2026-04-24.412');
    expect(formatDisplayedVersion('v2026-04-24')).toBe('v2026-04-24');
    expect(formatDisplayedVersion('1.4.0-2-g7fd2bc4+build.412')).toBe('v1.4.0-2-g7fd2bc4+build.412');
    expect(formatDisplayedVersion('v1.4.1')).toBe('v1.4.1');
    expect(formatDisplayedVersion('build.412-gabcdef1')).toBe('build.412-gabcdef1');
    expect(formatDisplayedVersion('main')).toBe('main');
  });
});
