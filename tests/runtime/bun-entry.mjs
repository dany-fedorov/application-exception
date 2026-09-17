// Runs inside Bun, from the throwaway consumer directory, against the packed artifact.
// It is copied next to the consumer's node_modules so `application-exception` resolves the
// same way it would for a downstream Bun project.
import appex from 'application-exception';
import { runFlow } from './flow.mjs';

if (typeof Bun === 'undefined') {
  throw new Error('bun-entry.mjs must be executed by Bun');
}

const summary = runFlow(appex, { runtime: `bun ${Bun.version}` });

// Bun is a server runtime: nanoid is expected to resolve to its CommonJS build here.
const nanoidEntry = Bun.resolveSync('nanoid', import.meta.dir);
const appexEntry = Bun.resolveSync('application-exception', import.meta.dir);

process.stdout.write(
  `__APPEX_RESULT__${JSON.stringify({
    ...summary,
    bunVersion: Bun.version,
    nanoidEntry,
    appexEntry,
  })}\n`,
);
