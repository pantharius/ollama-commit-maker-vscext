# Ollama Commit Maker

Ollama Commit Maker is a local-first VS Code extension for generating traceable Conventional Commit messages from staged Git changes using Ollama.

This repository is currently prepared for the MVP. The command and configuration surface are in place, but Git reading, Ollama calls, and local history writing are not implemented yet.

## Prerequisites

- VS Code
- Git
- Ollama running locally or at the configured URL
- The Ollama model configured in the extension settings

## Target MVP Behavior

The MVP will:

- add commands to the VS Code Source Control panel
- read the current Git commit message input
- collect staged changes
- use RTK when available, with a `git diff --staged` fallback
- build a Conventional Commit prompt
- send the prompt to Ollama
- replace the commit message input with the generated response
- save a local trace of the prompt and response
- provide a simple history view for local traces

The extension will not commit automatically.

## Settings

- `ollamaCommitMaker.ollamaUrl`: Ollama server URL. Default: `http://localhost:11434`
- `ollamaCommitMaker.model`: Ollama model used to generate commit messages. Default: `qwen2.5-coder`
- `ollamaCommitMaker.maxDiffLength`: Maximum staged diff length sent to Ollama. Default: `12000`
- `ollamaCommitMaker.useRtkIfAvailable`: Use RTK to compact staged changes when available. Default: `true`
- `ollamaCommitMaker.rtkCommand`: RTK command or binary path. Default: `rtk`
- `ollamaCommitMaker.includeEmoji`: Include an emoji in the generated commit title when relevant. Default: `true`

## Privacy

The planned MVP will send staged diffs to the configured Ollama URL and save a local history of prompts and responses. No backend or telemetry is used by this extension.
