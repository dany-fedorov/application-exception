# Development roadmap

See the [design proposal](docs/superpowers/specs/2026-09-10-error-model-design.md)
for rationale, proposed contracts, compatibility, and acceptance criteria, and
the [Effect research](docs/research/effect-error-model.md) for primary sources.
This roadmap is a proposal, not a list of shipped capabilities.

1. **Restore the baseline.** Repair the test fixture, message rendering after
   mutation, normalized causes, wrapping types, and the declared JSON shape.
   Replace empty tests with assertions for these contracts.
2. **Add complete typed construction.** Explicit literal tags, required details,
   rendered native messages, occurrence identity, and native cause support in an
   opt-in entry point. Keep the existing builder compatible.
3. **Make reports dependable.** Bounded diagnostic normalization, explicit public
   projection, correlated references, and deliberate behavior for cycles,
   aggregates, unusual values, and redaction.
4. **Prove usefulness.** Runnable service, HTTP/CLI, and pinned Effect examples;
   compile-time checks; a migration guide; and tests of the packed package.
5. **Add integrations when justified.** Validated report decoding, domain-error
   schema adapters, optional templating, and tracing support based on real use.

## Historical checklist

The entries below record earlier development; checked items do not establish
that the current implementation meets the contracts in the new roadmap.

- [x] a way to make message defaultable - .new accept no arg?
- [x] a way to make details typed [supported with extending classes]
- [x] a way to provide a merge function to merge details
- [x] Collect all superdefaults, not only from immediate prototype
- [x] Simpler subclass with plain options
```typescript
const MyAppException = AppEx.subclass(
  'MyAppException',
  ({ now }) => ({
    useClassNameAsCode: true,
    details: {
      src: 'my-app-api-server',
    },
  }), // but plain object is also supported
  { // a place for static methods
    create(this: ApplicationExceptionStatic, num: number) {
      return this.new(
        '{{pad 20 self.constructor_name}} // ISO Date: {{date-iso self.timestamp}}; Formatted Date: {{date-fmt "d MMMM yyyy, HH:mm:ss" self.timestamp}}; num: {{num}}',
      ).details({ num });
    },
  },
);
const MyAppException = AppEx.subclass('MyAppException', {}, {
  create: // ...
})
const MyAppException = AppEx.subclass('MyAppException', {
  useClassNameAsCode: true,
})
```
- [x] Allow to parametrize hbs helpers, add example with helpers to format date
- [ ] docs
  - [ ] Make a good guide
  - [x] Steve McConnell disagrees
  - [x] Features
    - fields + builder pattern
    - json representation
    - configurable with good defaults
- [ ] add json schema options
- [ ] tests
- [ ] semantic-release
- [ ] make more files to make code easier to understand
