# Development roadmap

Version 0.2 establishes the typed native-error and bounded v2 report contracts.
Future work should be driven by observed application needs:

- profile realistic failure bursts and deep stacks before changing ID generation
  or allocation behavior;
- consider application-specific domain codecs as separate integrations;
- add tracing adapters when a concrete telemetry target justifies them;
- keep templating or legacy compatibility outside the root package API;
- automate release notes/versioning only after the feature branch is reviewed.

Historical 0.1 design work remains in the repository with a superseded banner.
