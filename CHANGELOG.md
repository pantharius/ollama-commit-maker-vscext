# Change Log

All notable changes to the "Ollama Commit Maker" extension will be documented in this file.

## [0.0.5] - MVP

- Generate Conventional Commit messages from staged Git diffs with Ollama.
- Read and reuse the current Git commit input as user intent.
- Support configurable Ollama URL and model.
- Detect RTK when enabled, with automatic Git fallback.
- Show progress while collecting context and waiting for Ollama.
- Store local JSONL traces for successes and failures.
- Add a Webview history with trace details and diff viewer.
- Keep the workflow local-first with no backend, telemetry, or automatic commits.
