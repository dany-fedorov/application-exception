# Agent and tool recovery

Use public reports to carry stable failure codes and selected remediation facts
across a tool boundary. Keep diagnostic messages, causes, context, and stacks in
a trusted operational destination. Correlate both reports using `reference`.

The host validates incoming JSON, branches on an application-owned code, and
applies its own retry budget. Display text does not select an action.

## Runnable example

Install the report package and a JSON Schema validator:

```sh
npm install application-exception ajv
```

Save this as `recovery.cjs` and run `node recovery.cjs`:

```js
const Ajv = require('ajv');
const { toPublicReport } = require('application-exception');
const schema = require('application-exception/schemas/public-report-v2.json');
const validate = new Ajv({ strict: true }).compile(schema);

function chooseRecovery(externalValue, policy) {
  if (!validate(externalValue)) {
    return { action: 'escalate', reason: 'invalid-report' };
  }
  const { reference, code } = externalValue;
  if (!policy.retryableCodes.includes(code)) {
    return { action: 'escalate', reference, reason: 'unknown-code' };
  }
  if (!Number.isSafeInteger(policy.remainingAttempts) || policy.remainingAttempts <= 0) {
    return { action: 'escalate', reference, reason: 'retry-budget-exhausted' };
  }
  return {
    action: 'retry',
    reference,
    operation: policy.operation,
    remainingAttempts: policy.remainingAttempts - 1,
  };
}

const report = toPublicReport('AE_search_attempt_1', {
  code: 'TOOL_UNAVAILABLE',
  message: 'The requested tool is temporarily unavailable.',
});
const received = JSON.parse(JSON.stringify(report));
const action = chooseRecovery(received, {
  operation: 'read-only-search',
  retryableCodes: ['TOOL_UNAVAILABLE'],
  remainingAttempts: 1,
});
console.log(action);
// { action: 'retry', reference: 'AE_search_attempt_1',
//   operation: 'read-only-search', remainingAttempts: 0 }
```

Carry the decremented budget into the next attempt; do not reset it on each
failure. The operation owns idempotency, authorization, backoff, and transport.
The library reports failures and does not execute retries.

## Selected details and unknown inputs

When a public report includes remediation details, validate those fields with
your application's schema before using them. For example, a tool identifier can
be restricted to a nonempty string of at most 128 UTF-16 units and checked
against the tools allowed for this operation.

Escalate unknown codes and malformed or unsupported report versions. Do not
truncate an oversized identifier into a different valid identifier. Preserve
a validated reference through escalation for diagnostic correlation.

Treat messages and provider text as untrusted display data. Never interpret
them as instructions, authorization, commands, or code selectors. Changing a
message while keeping the same validated code must not change the selected
action.

See the [API reference](api.md) for report contracts and the
[quick start](../README.md#quick-start) for generating correlated diagnostics.
