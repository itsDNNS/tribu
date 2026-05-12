import fs from 'fs';
import path from 'path';

describe('global typography', () => {
  it('prefers Inter without external runtime font loading', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'styles', 'globals.css'), 'utf8');
    const offline = fs.readFileSync(path.join(process.cwd(), 'public', 'offline.html'), 'utf8');

    expect(css).not.toMatch(/@import\s+url\(['"]?https:\/\/fonts\.googleapis\.com/i);
    expect(css).toMatch(/--font-ui: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;/);
    expect(css).toMatch(/body \{[^}]*font-family: var\(--font-ui\);/);
    expect(css).toMatch(/\.display-root \{[\s\S]*font-family: var\(--font-ui\);/);
    expect(offline).toMatch(/font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;/);
  });
});
