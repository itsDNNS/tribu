const fs = require('fs');
const path = require('path');
const { render, validate } = require('../../scripts/generate-design-tokens');

const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '../../design/tokens.json'), 'utf8'));

function channel(value) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('design tokens', () => {
  it('are valid and styles/tokens.css is up to date', () => {
    expect(() => validate(tokens)).not.toThrow();
    const css = fs.readFileSync(path.join(__dirname, '../../styles/tokens.css'), 'utf8');
    expect(css).toBe(render(tokens));
  });

  // Text roles must reach WCAG AA (4.5:1) on the surfaces they sit on.
  const pairs = [
    ['text', 'bg'],
    ['text', 'surface'],
    ['textSecondary', 'surface'],
    ['textMuted', 'surface'],
    ['textMuted', 'bg'],
    ['accent', 'surface'],
    ['textOnAccent', 'accentFill'],
    ['success', 'surface'],
    ['warning', 'surface'],
    ['danger', 'surface'],
    ['info', 'surface'],
  ];
  for (const theme of ['light', 'dark']) {
    it.each(pairs)(`${theme}: %s on %s reaches 4.5:1`, (fg, bg) => {
      const colors = tokens.themes[theme].color;
      expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
