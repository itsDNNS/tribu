describe('trustedTypes', () => {
  afterEach(() => { delete window.trustedTypes; });

  function load() {
    let mod;
    jest.isolateModules(() => { mod = require('../../lib/trustedTypes'); });
    return mod;
  }

  it('passes values through where the browser has no Trusted Types', () => {
    const { trustedHTML, trustedScriptURL } = load();
    expect(trustedHTML('<path d="M0 0"/>')).toBe('<path d="M0 0"/>');
    expect(trustedScriptURL('/sw.js')).toBe('/sw.js');
  });

  it('wraps markup and allows only same-origin script URLs through the tribu policy', () => {
    const createPolicy = jest.fn((name, rules) => ({ createHTML: rules.createHTML, createScriptURL: rules.createScriptURL }));
    window.trustedTypes = { createPolicy };
    const { trustedHTML, trustedScriptURL } = load();

    expect(trustedHTML('<path/>')).toBe('<path/>');
    expect(trustedScriptURL('/sw.js')).toBe(`${window.location.origin}/sw.js`);
    expect(() => trustedScriptURL('https://evil.example/sw.js')).toThrow(TypeError);
    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy.mock.calls[0][0]).toBe('tribu');
  });
});
