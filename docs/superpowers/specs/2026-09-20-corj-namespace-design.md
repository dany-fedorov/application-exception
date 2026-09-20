# Corj utility namespace

The user approved a named `Corj` object, removal of standalone function exports,
and integration in both libraries. Earlier instructions authorize Sol medium
agents, autonomous documented decisions, pushes, merges, and releases.

## Public contract

`caught-object-report-json` exports a frozen, non-constructible `Corj` object:

```ts
import { Corj, CorjMaker } from 'caught-object-report-json';

Corj.makeReport(caught, input);
Corj.makeReportArray(caught, input);
Corj.restoreExpectedValues(report);
Corj.resolveRedactPolicy(policy);

const reporter = new CorjMaker(options);
reporter.makeReport(caught, call);
```

The four namespace properties are readonly in declarations and immutable at
runtime. They preserve existing signatures, generic inference, option handling,
argument-count validation, error behavior, default-maker reuse, and extracted
function calls (no `this` dependency). The package root no longer exports
`makeReport`, `makeReportArray`, `restoreExpectedValues`, or
`resolveCorjRedactPolicy`; no compatibility aliases or default export are added.
The resolver is named `resolveRedactPolicy` within `Corj` because the receiver
already supplies the CORJ context. All existing constants, types and the
`CorjMaker` class remain named exports. No new reporter operations are added.

The interpretation of “remove function exports” includes all four existing
public utility functions, not only the report constructors. Internal module
exports used to structure the implementation are not public package aliases.

## Application-exception integration

Redaction resolution uses `Corj.resolveRedactPolicy`. The package re-exports
the dependency's exact `Corj` object, replacing its standalone
`restoreExpectedValues` re-export. Its own typed-exception/reporting functions
retain their existing names. Consumers use:

```ts
import { Corj, makeDiagnosticReport } from 'application-exception';
const full = Corj.restoreExpectedValues(makeDiagnosticReport(caught));
```

Keep the agent API card useful: document the `Corj` re-export and the restoration
recipe, preserve exact signatures through the documentation generator, and
retain all documentation size/snippet gates. Update runtime and declaration
consumer assertions so absence of old exports is checked, including ESM.

## Compatibility and releases

- corj 13.0.0 and application-exception 0.7.0 identify breaking export changes.
- application-exception's final dependency and lock use registry `^13.0.0`.
- Report formats remain `corj/v0.15`, `corj/v0.15-full`, and `appex/public/v4`;
  diagnostic schema v6, historical schemas, public v3 decoding, fingerprints,
  redaction behavior and realm-v1 protocol are unchanged.
- Update live examples, docs, generated TypeDoc/API card and changelogs; preserve
  historical research, old release notes and schema files.
- Release notes include explicit before/after examples and migration checklists
  for both named-function imports and the former module-namespace import style.
- Full coverage and packed consumers remain release gates. Independent Sol
  medium review precedes publication. Feature CI runs before a `[skip ci]`
  merge and annotated tag are pushed atomically, avoiding automatic/manual
  publication races. Publish exact verified tarballs, corj first, then finish
  application-exception against its registry dependency. Verify registry
  metadata/integrity and fresh installations; create both GitHub Releases.

## Decision consequences

Grouping all utilities makes an additional import migration necessary for
resolver/restoration consumers. Re-exporting `Corj` from application-exception
keeps restoration discoverable without maintaining a function alias. A frozen
object has no constructor or mutable global configuration. No wire-schema bump
is needed because only the API organization changes.
