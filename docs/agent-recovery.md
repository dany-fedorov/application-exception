# Agent and tool recovery

Use the public v2 report as a small application-selected action input. Validate
an external value with the shipped
[`public-report-v2.json`](../schemas/public-report-v2.json) schema at the host
boundary. Keep the diagnostic report in an authorized operational sink; its
messages, stack, causes, and context may contain sensitive data.

The runnable repository
[`agent-recovery.ts`](https://github.com/dany-fedorov/application-exception/blob/main/examples/agent-recovery.ts)
example follows four rules:

1. Branch only on a stable application-selected `code`.
2. Copy only small remediation fields selected for public disclosure.
3. Escalate unknown codes and malformed/unknown wire versions.
4. Retry only when the operation's policy marks the code retryable and supplies
   a positive remaining-attempt budget.

```ts
const report = toPublicReport(diagnostic.reference, {
  code: 'TOOL_UNAVAILABLE',
  message: 'The requested tool is temporarily unavailable.',
  details: { tool: 'search' },
});

const action = chooseRecoveryAction(report, {
  operation: 'read-only-search',
  retryableCodes: ['TOOL_UNAVAILABLE'],
  remainingAttempts: 1,
});
```

The operation owns idempotency, authorization, backoff, and transport handling.
The package does not infer retry safety from an error kind and does not provide
automatic retry behavior.

Treat `message`, diagnostic prose, provider errors, and any other external text
as untrusted data. Never reinterpret it as an instruction, authorization, tool
command, or code selector. Changing the message while keeping the same validated
code must not change the action. Preserve `reference` through escalation so a
human or service can correlate the public event with trusted diagnostics.
