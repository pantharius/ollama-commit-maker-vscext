# Ollama Commit Maker

VS Code extension that generates traceable Conventional Commit messages from staged Git changes using Ollama.

## Features

- Reads the message already typed in the Git commit input.
- Collects staged Git changes only.
- Uses RTK when available, with `git diff --staged` as the reliable fallback.
- Builds a Conventional Commit prompt and sends it to the configured Ollama server.
- Replaces the Git commit input with the generated commit message.
- Saves a local JSONL trace for each generation attempt, including the full staged diff for audit.
- Provides a static React Webview history to inspect prompts, responses, steps, and saved diffs.

The extension never commits automatically.

## Requirements

- VS Code
- Git
- Ollama running locally or on a reachable server
- The configured Ollama model pulled on that server

If Ollama runs on another machine, set `ollamaCommitMaker.ollamaUrl` to that server, for example `http://192.168.1.42:11434`.

## Usage

1. Stage one or more files in Git.
2. Optionally type an intent in the Source Control commit message input.
3. Run `Generate Commit Message` from the Source Control title bar.
4. Review the generated message in the commit input.
5. Run `Open Commit Message History` to inspect local traces.

## Settings

- `ollamaCommitMaker.ollamaUrl`: Ollama server URL. Default: `http://localhost:11434`
- `ollamaCommitMaker.model`: Ollama model used to generate commit messages. Default: `qwen2.5-coder`
- `ollamaCommitMaker.maxDiffLength`: Maximum staged diff length sent to Ollama. Default: `12000`
- `ollamaCommitMaker.useRtkIfAvailable`: Use RTK to compact staged changes when available. Default: `true`
- `ollamaCommitMaker.rtkCommand`: RTK command or binary path. Default: `rtk`
- `ollamaCommitMaker.includeEmoji`: Include an emoji in the generated commit title when relevant. Default: `true`

## RTK Support

When enabled, the extension tries to detect RTK and collect a compact staged diff with it. If RTK is missing or fails, the command falls back to Git automatically.

RTK absence is not an error. The fallback command is `git diff --staged --minimal --no-ext-diff`.

## History And Traceability

Each generation attempt is stored as one JSON line in VS Code extension storage, outside the user repository. The trace includes repository metadata, commit input, staged files, the full staged diff, the diff sent to the model, prompt, Ollama response, final message, status, duration, and generation steps.

`ollamaCommitMaker.maxDiffLength` only limits the diff sent to Ollama. The full staged diff is still saved locally in history so you can audit what was staged at generation time.

Use `Open Commit Message History` to view the latest traces in a local React Webview bundled with the extension. The Webview is built with Vite into static files; it does not run a development server or make network requests.

From a trace, the saved patch can be viewed in the embedded diff viewer or opened in VS Code's native diff editor.

## Privacy

There is no backend and no telemetry.

The extension sends the prompt, including staged diff content, to `ollamaCommitMaker.ollamaUrl`. Diffs and prompts can contain sensitive code. Local history can contain the complete staged diff and is stored in VS Code extension storage, not in the repository.

The History Webview loads only bundled local assets. There is no CDN, backend, telemetry, or browser-side network call.

## Known Limitations

- The first Git repository reported by VS Code is used.
- Only staged changes are considered.
- Large diffs are truncated according to `ollamaCommitMaker.maxDiffLength`.
- The history Webview shows recent local traces only.
- Historical diffs are reconstructed from saved patch hunks, not from full file snapshots.
- Older traces created before `diffFull` existed only show the diff that was sent to the model.
- No authentication is added for remote Ollama servers in the MVP.

## Development

```bash
npm install
npm run webview:build
npm run lint
```

Run the extension from VS Code with `Run Extension`, then use the Source Control panel in the Extension Development Host.

## Packaging

```bash
npm run package
```
