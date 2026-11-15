// The one Trusted Types policy for Tribu's own markup and scripts. It only wraps
// values the app ships itself (bundled SVG art, the service worker path), so the
// browser can refuse any other string that reaches an HTML or script sink.
let policy;

function tribuPolicy() {
  if (policy === undefined) {
    policy = typeof window !== 'undefined' && window.trustedTypes?.createPolicy
      ? window.trustedTypes.createPolicy('tribu', {
        createHTML: (html) => html,
        createScriptURL: (url) => {
          const parsed = new URL(url, window.location.href);
          if (parsed.origin !== window.location.origin) throw new TypeError(`Scripts must come from Tribu: ${url}`);
          return parsed.href;
        },
      })
      : null;
  }
  return policy;
}

export function trustedHTML(html) {
  return tribuPolicy()?.createHTML(html) ?? html;
}

export function trustedScriptURL(url) {
  return tribuPolicy()?.createScriptURL(url) ?? url;
}
