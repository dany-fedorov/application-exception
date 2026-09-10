# Changelog

## 0.2.0

- Replaced the legacy builder and `/typed` entry with the root
  `defineException({ tag, message, idPrefix? })` API.
- Added constant-message no-details errors, bounded construction validation,
  local instance narrowing, foreign-copy diagnostic metadata, and lazy stacks.
- Added bounded v2 diagnostic/public reports, reference-only public projection,
  stack opt-in, explicit unsupported/truncation markers, and detached decoding.
- Shipped diagnostic/public JSON Schemas, migration and agent recovery guides,
  runnable examples, installed-tarball declaration/runtime checks, current review
  probes, and an optional benchmark.
- Removed Handlebars, pojo-constructor, and caught-object-report-json from runtime
  dependencies. Effect remains an optional development integration.

See [the migration guide](docs/migration-to-typed-errors.md) for all breaking
changes from 0.1.
