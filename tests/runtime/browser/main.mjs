// Entry for the browser fixture. Imports the packed artifact and runs the shared contract flow.
// The page must behave like an ordinary frontend: no Node shims, no ambient Bun globals.
import appex from 'application-exception';
import { runFlow } from '../flow.mjs';

const report = (value) => {
  window.__APPEX__ = value;
  document.getElementById('output').textContent = JSON.stringify(
    value,
    null,
    2,
  );
};

try {
  // Fail loudly if the bundler or the host smuggled a server runtime in.
  const leaked = [
    'Bun',
    'process',
    'require',
    'Buffer',
    'global',
    '__dirname',
  ].filter((name) => typeof globalThis[name] !== 'undefined');
  if (leaked.length > 0) {
    throw new Error(
      `server-runtime globals leaked into the page: ${leaked.join(', ')}`,
    );
  }
  if (
    typeof crypto === 'undefined' ||
    typeof crypto.getRandomValues !== 'function'
  ) {
    throw new Error(
      'crypto.getRandomValues is unavailable; nanoid cannot generate ids',
    );
  }

  const summary = runFlow(appex, { runtime: 'browser' });
  report({
    ok: true,
    ...summary,
    isSecureContext: window.isSecureContext,
    userAgent: navigator.userAgent,
  });
} catch (error) {
  report({
    ok: false,
    error: String(error && error.stack ? error.stack : error),
  });
}
