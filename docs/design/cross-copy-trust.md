# Trust between loaded package copies — decision record (issue #46)

Status: **implemented** as `createTrustRealm`.

## The observed behaviour, and why it was deliberate

[#46](https://github.com/dany-fedorov/application-exception/issues/46) reports
that an occurrence built by copy A is not recognized by copy B: `isTypedException`
returns false, and B's public reporter falls back to `INTERNAL_ERROR` instead of
the kind's configured code.

That is what the original design guarantees. `src/typed-internals.ts` keeps
identity in module-local `WeakSet`/`WeakMap` registries. The global
`Symbol.for('application-exception/TypedException')` brand is documented as a
diagnostic hint, never proof. A disclosure policy decides what leaves the
process, so a value that merely *claims* to be a typed exception must not be
able to pick its own public code.

One thing already crossed the boundary and still does: `brandedOccurrenceId`
reads `occurrenceId` from a foreign branded value's data properties, so
correlation between copies survives with or without a realm. Only the policy
needed a decision.

## The assumption

The issue proposes "an explicit trusted bridge, shared registry injection, or
other supported way" — three designs with different blast radii — and constrains
the answer (no forged tag, brand, or wire value may acquire a policy; version
mismatch must be explicit) without choosing one.

**Assumption taken:** the trust boundary is a capability, not a name. Trust is
granted by passing an unforgeable object reference, at definition time and at
report time, by the code that owns the policy.

## What was built

```ts
import { createTrustRealm, defineException, toPublicReport } from 'application-exception';

// the host that owns reporting creates the realm and hands it out
export const realm = createTrustRealm();

// each cooperating copy opts in where it defines failures
const Timeout = defineException({
  tag: 'db/Timeout', message: 'Timed out',
  public: { code: 'DB_TIMEOUT' },
  realm,
});

// and where it reports them
toPublicReport(caught, { realm }).code; // 'DB_TIMEOUT' across copies
isTypedException(caught, realm);        // true across copies
```

`realm` is accepted by `defineException`, `isTypedException`, `toPublicReport`,
and `toReports`. `toDiagnosticReport` does not take one: a diagnostic report
consults no disclosure policy, and occurrence correlation across copies already
works through `brandedOccurrenceId` without any opt-in.

A realm holds its own `WeakSet`/`WeakMap` behind a frozen method table published
under `Symbol.for('application-exception/TrustRealm')`. The methods, not the
layout, are the contract, so two copies with different module-local state still
share one registry.

## Why this satisfies the anti-forgery criteria

- **Keyed by object identity only.** Nothing is looked up by `_tag`, by the
  global brand, or by any value read off the caught object. A forged tag or
  brand acquires no policy; the test suite asserts this with a hand-built object
  carrying both.
- **Wire-deserialized values can never participate.** They carry data, not
  object references, so a `JSON.parse`d report cannot be in any realm's
  `WeakSet`. Asserted in the suite.
- **The realm is the decision.** A hostile value cannot nominate a realm — only
  the application chooses what it passes. An object hand-shaped like a realm
  therefore speaks only for the caller that built it, which is no more power
  than calling `createTrustRealm` yourself.
- **The local registry wins**, so a kind defined in the reporting copy can never
  have its policy shadowed by a realm.
- **A hostile realm cannot break reporting.** If `has` or `policyOf` throws, or
  returns something that is not a policy, the value falls back to the safe
  generic behaviour.
- **Version mismatch is explicit.** A realm records the protocol it speaks
  (`appex/realm/v1`). A copy meeting a different protocol, or a realm claiming
  the protocol without its methods, throws `APPEX_INVALID_TRUST_REALM` naming
  both sides, rather than silently half-trusting.
- **Without opt-in nothing changes.** No realm means the 0.3.0 isolation,
  asserted by a two-copy fixture.

## Rejected alternatives

- Trusting a matching `_tag` or the `Symbol.for` brand — forgeable by any value
  in the process.
- A `globalThis` registry — ambient, and any code in the process can join it.
- Trusting deserialized JSON — ruled out by the issue directly.

## Deduplication, and its limits

Deduplicating the install so only one copy loads — `npm dedupe`, a pnpm
`overrides`/`resolutions` pin, a bundler `alias` — removes the problem where it
applies. It does not help when two independently bundled artifacts each embed
their own copy, which is the case the issue is about, and it cannot be relied on
across a package boundary you do not control.
