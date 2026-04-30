const fs = require('fs');
const path = require('path');

function loadManifest() {
  const manifestPath = path.join(__dirname, '../public/manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

describe('PWA manifest', () => {
  it('declares a stable install identity and standalone app shell', () => {
    const manifest = loadManifest();

    expect(manifest).toEqual(expect.objectContaining({
      name: expect.any(String),
      short_name: expect.any(String),
      description: expect.any(String),
      start_url: '/',
      id: '/',
      scope: '/',
      display: 'standalone',
      theme_color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
      background_color: expect.stringMatching(/^#[0-9a-f]{6}$/i),
    }));
  });

  it('offers app shortcuts for the daily mobile workflows', () => {
    const manifest = loadManifest();

    expect(manifest.shortcuts).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Dashboard', url: '/?view=dashboard' }),
      expect.objectContaining({ name: 'Calendar', url: '/?view=calendar' }),
      expect.objectContaining({ name: 'Tasks', url: '/?view=tasks' }),
      expect.objectContaining({ name: 'Shopping', url: '/?view=shopping' }),
    ]));

    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.short_name).toEqual(expect.any(String));
      expect(shortcut.description).toEqual(expect.any(String));
      expect(shortcut.icons).toEqual(expect.arrayContaining([
        expect.objectContaining({ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }),
      ]));
    }
  });

  it('ships regular and maskable install icons with files present', () => {
    const manifest = loadManifest();
    expect(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'any')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '192x192' && icon.purpose === 'maskable')).toBe(true);
    expect(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(fs.existsSync(path.join(__dirname, '../public', icon.src))).toBe(true);
    }
  });
});
