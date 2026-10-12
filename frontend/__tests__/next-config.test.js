const nextConfig = require('../next.config');

describe('next.config', () => {
  it('keeps next dev from writing AGENTS.md into the repository', () => {
    // The repository only keeps core Markdown files; docs live in the Wiki.
    expect(nextConfig.agentRules).toBe(false);
  });
});
