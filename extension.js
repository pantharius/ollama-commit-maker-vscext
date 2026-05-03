"use strict";

const vscode = require("vscode");
const {
  getRepository,
  getCommitInput,
  setCommitInput,
  getRepositoryRoot,
  getStagedFiles,
  getStagedDiff,
} = require("./src/git");
const { detectRtk, tryGetRtkDiff } = require("./src/rtk");
const { buildCommitPrompt } = require("./src/prompt");
const { generateCommitMessageWithOllama } = require("./src/ollama");

const GENERATE_COMMAND = "ollamaCommitMaker.generateCommitMessage";
const OPEN_HISTORY_COMMAND = "ollamaCommitMaker.openHistory";

let rtkDetection = null;

function getConfig() {
  const config = vscode.workspace.getConfiguration("ollamaCommitMaker");

  return {
    ollamaUrl: config.get("ollamaUrl"),
    model: config.get("model", "qwen2.5-coder"),
    maxDiffLength: config.get("maxDiffLength", 12000),
    useRtkIfAvailable: config.get("useRtkIfAvailable", true),
    rtkCommand: config.get("rtkCommand", "rtk"),
    includeEmoji: config.get("includeEmoji", true),
  };
}

async function detectConfiguredRtk() {
  const config = getConfig();

  console.log(
    `[Ollama Commit Maker] RTK enabled by settings: ${config.useRtkIfAvailable}`
  );

  if (!config.useRtkIfAvailable) {
    rtkDetection = null;
    return null;
  }

  rtkDetection = await detectRtk(config.rtkCommand);

  console.log(`[Ollama Commit Maker] RTK detected: ${rtkDetection.available}`);
  console.log(`[Ollama Commit Maker] RTK command used: ${rtkDetection.command}`);
  if (rtkDetection.version) {
    console.log(`[Ollama Commit Maker] RTK version: ${rtkDetection.version}`);
  }
  if (rtkDetection.error) {
    console.log(`[Ollama Commit Maker] RTK detection error: ${rtkDetection.error}`);
  }

  return rtkDetection;
}

function truncateDiff(diff, maxDiffLength) {
  const limit = Number.isFinite(maxDiffLength) && maxDiffLength > 0
    ? maxDiffLength
    : 12000;

  if (diff.length <= limit) {
    return {
      diff,
      truncated: false,
    };
  }

  return {
    diff: diff.slice(0, limit),
    truncated: true,
  };
}

async function collectDiff(rootPath, config) {
  let fallbackReason = "RTK disabled by settings.";

  if (config.useRtkIfAvailable) {
    if (
      !rtkDetection ||
      rtkDetection.command !== config.rtkCommand ||
      !rtkDetection.available
    ) {
      await detectConfiguredRtk();
    }

    if (rtkDetection?.available) {
      const rtkDiff = await tryGetRtkDiff(rootPath, config.rtkCommand);

      if (rtkDiff) {
        return {
          diff: rtkDiff,
          source: "rtk",
        };
      }

      fallbackReason = "RTK returned no usable staged diff.";
    } else {
      fallbackReason = rtkDetection?.error || "RTK is not available.";
    }
  }

  console.log(`[Ollama Commit Maker] Git fallback reason: ${fallbackReason}`);

  return {
    diff: await getStagedDiff(rootPath),
    source: "git",
  };
}

async function generateCommitMessage() {
  try {
    const config = getConfig();
    const repository = await getRepository();
    const previousInput = getCommitInput(repository);
    const rootPath = getRepositoryRoot(repository);
    const stagedFiles = await getStagedFiles(rootPath);
    const collectedDiff = await collectDiff(rootPath, config);
    const rawDiffLength = collectedDiff.diff.length;
    const truncatedDiff = truncateDiff(collectedDiff.diff, config.maxDiffLength);

    console.log(`[Ollama Commit Maker] Diff source used: ${collectedDiff.source}`);
    console.log(`[Ollama Commit Maker] Raw diff length: ${rawDiffLength}`);
    console.log(
      `[Ollama Commit Maker] Final diff length: ${truncatedDiff.diff.length}`
    );
    console.log(`[Ollama Commit Maker] Diff truncated: ${truncatedDiff.truncated}`);
    console.log(`[Ollama Commit Maker] Ollama model: ${config.model}`);
    console.log(`[Ollama Commit Maker] Ollama URL: ${config.ollamaUrl}`);

    const promptParts = buildCommitPrompt({
      inputCommitMessage: previousInput,
      stagedFilesRaw: stagedFiles.join("\n"),
      diffSource: collectedDiff.source,
      diffSent: truncatedDiff.diff,
      includeEmoji: config.includeEmoji,
    });
    const promptSize = promptParts.system.length + promptParts.prompt.length;

    console.log(`[Ollama Commit Maker] Prompt size: ${promptSize}`);

    const generatedCommitMessage = await generateCommitMessageWithOllama({
      ollamaUrl: config.ollamaUrl,
      model: config.model,
      system: promptParts.system,
      prompt: promptParts.prompt,
    });

    console.log(
      `[Ollama Commit Maker] Response size: ${generatedCommitMessage.length}`
    );
    console.log(
      `[Ollama Commit Maker] Generated commit message: ${generatedCommitMessage}`
    );

    setCommitInput(repository, generatedCommitMessage);

    vscode.window.showInformationMessage("Commit message generated.");
  } catch (error) {
    console.error("[Ollama Commit Maker] Failed to generate commit message", error);
    vscode.window.showErrorMessage(
      `Ollama Commit Maker: ${error.message || "Unexpected error."}`
    );
  }
}

function showHistoryRegisteredMessage() {
  vscode.window.showInformationMessage(
    "Ollama Commit Maker: history command registered."
  );
}

function activate(context) {
  void detectConfiguredRtk();

  const generateCommand = vscode.commands.registerCommand(
    GENERATE_COMMAND,
    generateCommitMessage
  );
  const openHistoryCommand = vscode.commands.registerCommand(
    OPEN_HISTORY_COMMAND,
    showHistoryRegisteredMessage
  );

  context.subscriptions.push(generateCommand, openHistoryCommand);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
