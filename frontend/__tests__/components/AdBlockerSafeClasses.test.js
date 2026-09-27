import fs from 'fs';
import path from 'path';

// Generic ad-blocker lists such as EasyList hide elements like `.ad-header`,
// `.ad-panel` or `.ad-tabs` on every site, which emptied the admin page (#508).
const BLOCKED_CLASS = /(?<![\w-])\.?ads?-[a-z]/;
const ROOTS = ['components', 'pages', 'styles', 'hooks', 'lib'];

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(js|jsx|css)$/.test(entry.name) ? [full] : [];
  });
}

describe('ad-blocker safe class names', () => {
  it('never uses ad- or ads- prefixed class names', () => {
    const offenders = ROOTS.flatMap((root) => sourceFiles(path.join(process.cwd(), root)))
      .flatMap((file) =>
        fs
          .readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => [line, i + 1])
          .filter(([line]) => BLOCKED_CLASS.test(line))
          .map(([line, n]) => `${path.relative(process.cwd(), file)}:${n}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
