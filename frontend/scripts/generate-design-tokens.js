#!/usr/bin/env node

// Writes styles/tokens.css from design/tokens.json, the one source of the
// Tribu design tokens (see the Design and Frontend Guidelines page in the
// Wiki). Other clients generate their tokens from a copy of the same file.
// The themes in that file are the whole theme list: the web app reads their
// names from it, and the backend gets a copy (backend/app/ui_themes.json) so
// it accepts the same themes. A new theme is one more entry there.
//
//   node scripts/generate-design-tokens.js           write both files
//   node scripts/generate-design-tokens.js --check   fail when either is stale

const fs = require('fs');
const path = require('path');

const FRONTEND_ROOT = path.resolve(__dirname, '..');
const TOKENS_PATH = path.join(FRONTEND_ROOT, 'design', 'tokens.json');
const OUTPUT_PATH = path.join(FRONTEND_ROOT, 'styles', 'tokens.css');
const BACKEND_THEMES_PATH = path.join(FRONTEND_ROOT, '..', 'backend', 'app', 'ui_themes.json');
// "system" follows the device between light and dark, and the bare :root
// keeps the Midnight Glass look, so these three always have to exist.
const REQUIRED_THEMES = ['light', 'dark', 'midnight-glass'];
const THEME_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const COLOR_PATTERN = /^(#[0-9A-F]{6}|rgba\(\d{1,3}, \d{1,3}, \d{1,3}, (0|1|0?\.\d+)\))$/;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function kebab(name) {
  return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function validate(tokens) {
  for (const theme of REQUIRED_THEMES) assert(tokens.themes?.[theme], `design/tokens.json needs the ${theme} theme`);
  const roles = Object.keys(tokens.themes.light.color);
  for (const [theme, entry] of Object.entries(tokens.themes)) {
    assert(THEME_KEY_PATTERN.test(theme) && theme !== 'system', `${theme}: theme keys are lower-case letters, digits and dashes, and not "system"`);
    assert(typeof entry.name === 'string' && entry.name.trim(), `${theme}: name is missing`);
    assert(['light', 'dark'].includes(entry.colorScheme), `${theme}: colorScheme must be light or dark`);
    assert(
      JSON.stringify(Object.keys(entry.color)) === JSON.stringify(roles),
      `${theme}: colour roles must match the light theme in the same order`,
    );
    for (const [role, value] of Object.entries(entry.color)) {
      assert(COLOR_PATTERN.test(value), `${theme}.${role}: use #RRGGBB or rgba(r, g, b, a), got ${value}`);
    }
    for (const size of ['sm', 'md', 'lg']) {
      assert(typeof entry.shadow?.[size] === 'string', `${theme}: shadow.${size} is missing`);
    }
  }
  assert(Array.isArray(tokens.member) && tokens.member.length >= 8, 'member needs at least eight colours');
  for (const value of tokens.member) assert(/^#[0-9A-F]{6}$/.test(value), `member colour ${value} must be #RRGGBB`);
  for (const [name, style] of Object.entries(tokens.type)) {
    for (const key of ['family', 'size', 'lineHeight', 'weight']) {
      assert(style[key] !== undefined, `type.${name}.${key} is missing`);
    }
    assert(style.size >= 13, `type.${name}: nothing below 13 px`);
  }
}

function themeBlock(selector, entry) {
  const lines = [`${selector} {`];
  for (const [role, value] of Object.entries(entry.color)) {
    lines.push(`  --color-${kebab(role)}: ${value};`);
  }
  for (const [size, value] of Object.entries(entry.shadow)) {
    lines.push(`  --shadow-${size}: ${value};`);
  }
  lines.push(`  color-scheme: ${entry.colorScheme};`);
  lines.push('}');
  return lines.join('\n');
}

function render(tokens) {
  const shared = [':root {'];
  tokens.member.forEach((value, index) => shared.push(`  --member-${index + 1}: ${value};`));
  for (const [name, style] of Object.entries(tokens.type)) {
    const key = kebab(name);
    shared.push(`  --type-${key}-size: ${style.size / 16}rem;`);
    shared.push(`  --type-${key}-line: ${style.lineHeight / 16}rem;`);
    shared.push(`  --type-${key}-weight: ${style.weight};`);
    if (style.tracking) shared.push(`  --type-${key}-tracking: ${style.tracking}em;`);
  }
  for (const [step, value] of Object.entries(tokens.space)) shared.push(`  --space-${step}: ${value}px;`);
  for (const [name, value] of Object.entries(tokens.radius)) shared.push(`  --radius-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(tokens.motion)) shared.push(`  --motion-${name}: ${value}ms;`);
  shared.push('}');

  // The default (no data-theme) matches the Midnight Glass look, as before.
  const blocks = [
    '/* Generated from design/tokens.json by scripts/generate-design-tokens.js. Do not edit. */',
    shared.join('\n'),
    themeBlock(':root', tokens.themes['midnight-glass']),
    ...Object.entries(tokens.themes).map(([theme, entry]) => themeBlock(`[data-theme="${theme}"]`, entry)),
  ];
  return `${blocks.join('\n\n')}\n`;
}

// The backend's copy: the theme keys and their colour schemes, in order.
function renderBackendThemes(tokens) {
  const themes = Object.entries(tokens.themes).map(([key, entry]) => ({ key, colorScheme: entry.colorScheme }));
  return `${JSON.stringify({ generatedFrom: 'frontend/design/tokens.json', themes }, null, 2)}\n`;
}

function main() {
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  validate(tokens);
  const outputs = [
    [OUTPUT_PATH, render(tokens)],
    [BACKEND_THEMES_PATH, renderBackendThemes(tokens)],
  ];
  if (process.argv.includes('--check')) {
    for (const [file, content] of outputs) {
      const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      if (current !== content) {
        console.error(`${path.relative(FRONTEND_ROOT, file)} is stale. Run \`npm run tokens:generate\`.`);
        process.exit(1);
      }
    }
    return;
  }
  for (const [file, content] of outputs) fs.writeFileSync(file, content);
}

if (require.main === module) main();

module.exports = { render, renderBackendThemes, validate };
