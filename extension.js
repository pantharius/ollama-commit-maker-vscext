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
const { appendHistoryEntry, getHistoryFileUri } = require("./src/history");

const GENERATE_COMMAND = "ollamaCommitMaker.generateCommitMessage";
const OPEN_HISTORY_COMMAND = "ollamaCommitMaker.openHistory";
const OLLAMA_OPTIONS = {
  temperature: 0.2,
};

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

function createHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function startStep(steps, name, label) {
  const step = {
    name,
    label,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    success: null,
    error: null,
  };

  steps.push(step);

  return step;
}

function finishStep(step, success = true, error = null) {
  step.finishedAt = new Date().toISOString();
  step.success = success;
  step.error = error ? String(error.message || error) : null;
}

async function runProgressStep(progress, steps, name, label, action) {
  progress.report({
    increment: 10,
    message: label,
  });

  const step = startStep(steps, name, label);

  try {
    const result = await action();
    finishStep(step);
    return result;
  } catch (error) {
    finishStep(step, false, error);
    throw error;
  }
}

function buildHistoryEntry({
  id,
  createdAt,
  durationMs,
  repository,
  rootPath,
  input,
  promptParts,
  config,
  output,
  success,
  error,
  steps,
}) {
  return {
    id,
    createdAt,
    repository: {
      rootPath: rootPath || null,
      branch: repository?.state?.HEAD?.name || null,
      workspaceName: vscode.workspace.name || null,
    },
    input: {
      commitMessage: input.commitMessage || "",
      stagedFilesRaw: input.stagedFilesRaw || "",
      stagedFilesCount: input.stagedFilesCount || 0,
      diffSource: input.diffSource || null,
      diffOriginalLength: input.diffOriginalLength || 0,
      diffSentLength: input.diffSentLength || 0,
      diffWasTruncated: input.diffWasTruncated || false,
      diffSent: input.diffSent || "",
    },
    prompt: {
      system: promptParts?.system || "",
      user: promptParts?.prompt || "",
      full: promptParts ? `${promptParts.system}\n\n${promptParts.prompt}` : "",
    },
    ollama: {
      url: config.ollamaUrl || "",
      model: config.model || "",
      options: OLLAMA_OPTIONS,
    },
    output: {
      rawResponse: output.rawResponse || "",
      cleanedCommitMessage: output.cleanedCommitMessage || "",
    },
    status: {
      success,
      error: error ? String(error.message || error) : null,
      durationMs,
    },
    steps,
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

async function generateCommitMessage(context) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Generating commit message",
      cancellable: false,
    },
    (progress) => generateCommitMessageWithProgress(context, progress)
  );
}

async function generateCommitMessageWithProgress(context, progress) {
  const config = getConfig();
  const id = createHistoryId();
  const createdAt = new Date().toISOString();
  const startedAt = Date.now();
  const steps = [];
  const input = {};
  const output = {};
  let repository = null;
  let rootPath = null;
  let promptParts = null;
  let commandError = null;
  let success = false;

  try {
    const repositoryContext = await runProgressStep(
      progress,
      steps,
      "findGitRepository",
      "Finding Git repository",
      async () => {
        const selectedRepository = await getRepository();
        return {
          repository: selectedRepository,
          rootPath: getRepositoryRoot(selectedRepository),
        };
      }
    );
    repository = repositoryContext.repository;
    rootPath = repositoryContext.rootPath;

    const previousInput = await runProgressStep(
      progress,
      steps,
      "readCommitInput",
      "Reading commit input",
      async () => getCommitInput(repository)
    );
    input.commitMessage = previousInput;

    const stagedFiles = await runProgressStep(
      progress,
      steps,
      "readStagedFiles",
      "Reading staged files",
      async () => getStagedFiles(rootPath)
    );
    input.stagedFilesRaw = stagedFiles.join("\n");
    input.stagedFilesCount = stagedFiles.length;

    const collectedDiff = await runProgressStep(
      progress,
      steps,
      "collectStagedDiff",
      "Collecting staged diff",
      async () => collectDiff(rootPath, config)
    );
    const rawDiffLength = collectedDiff.diff.length;
    const truncatedDiff = truncateDiff(collectedDiff.diff, config.maxDiffLength);
    input.diffSource = collectedDiff.source;
    input.diffOriginalLength = rawDiffLength;
    input.diffSentLength = truncatedDiff.diff.length;
    input.diffWasTruncated = truncatedDiff.truncated;
    input.diffSent = truncatedDiff.diff;

    console.log(`[Ollama Commit Maker] Diff source used: ${collectedDiff.source}`);
    console.log(`[Ollama Commit Maker] Raw diff length: ${rawDiffLength}`);
    console.log(
      `[Ollama Commit Maker] Final diff length: ${truncatedDiff.diff.length}`
    );
    console.log(`[Ollama Commit Maker] Diff truncated: ${truncatedDiff.truncated}`);
    console.log(`[Ollama Commit Maker] Ollama model: ${config.model}`);
    console.log(`[Ollama Commit Maker] Ollama URL: ${config.ollamaUrl}`);

    promptParts = await runProgressStep(
      progress,
      steps,
      "buildPrompt",
      "Building prompt",
      async () =>
        buildCommitPrompt({
          inputCommitMessage: previousInput,
          stagedFilesRaw: input.stagedFilesRaw,
          diffSource: collectedDiff.source,
          diffSent: truncatedDiff.diff,
          includeEmoji: config.includeEmoji,
        })
    );
    const promptSize = promptParts.system.length + promptParts.prompt.length;

    console.log(`[Ollama Commit Maker] Prompt size: ${promptSize}`);

    await runProgressStep(
      progress,
      steps,
      "sendPromptToOllama",
      "Sending prompt to Ollama",
      async () => null
    );

    const generatedCommitMessage = await runProgressStep(
      progress,
      steps,
      "waitForOllamaResponse",
      "Waiting for Ollama response",
      async () =>
        generateCommitMessageWithOllama({
          ollamaUrl: config.ollamaUrl,
          model: config.model,
          system: promptParts.system,
          prompt: promptParts.prompt,
        })
    );
    output.rawResponse = generatedCommitMessage.rawResponse;

    const cleanedCommitMessage = await runProgressStep(
      progress,
      steps,
      "cleanGeneratedMessage",
      "Cleaning generated message",
      async () => {
        if (!generatedCommitMessage.cleanedCommitMessage) {
          throw new Error("Ollama returned an empty commit message.");
        }

        return generatedCommitMessage.cleanedCommitMessage;
      }
    );
    output.cleanedCommitMessage = cleanedCommitMessage;

    console.log(
      `[Ollama Commit Maker] Response size: ${output.rawResponse.length}`
    );
    console.log(
      `[Ollama Commit Maker] Generated commit message: ${cleanedCommitMessage}`
    );

    await runProgressStep(
      progress,
      steps,
      "updateCommitBox",
      "Updating commit box",
      async () => setCommitInput(repository, cleanedCommitMessage)
    );
    success = true;

    vscode.window.showInformationMessage("Commit message generated.");
  } catch (error) {
    commandError = error;
    console.error("[Ollama Commit Maker] Failed to generate commit message", error);
    vscode.window.showErrorMessage(
      `Ollama Commit Maker: ${error.message || "Unexpected error."}`
    );
  } finally {
    progress.report({
      increment: 10,
      message: "Saving trace",
    });

    const saveStep = startStep(steps, "saveTrace", "Saving trace");
    finishStep(saveStep);

    const entry = buildHistoryEntry({
      id,
      createdAt,
      durationMs: Date.now() - startedAt,
      repository,
      rootPath,
      input,
      promptParts,
      config,
      output,
      success,
      error: commandError,
      steps,
    });

    await appendHistoryEntry(context, entry);
  }
}

async function openHistory(context) {
  try {
    const historyFileUri = getHistoryFileUri(context);

    await vscode.workspace.fs.stat(historyFileUri);

    const document = await vscode.workspace.openTextDocument(historyFileUri);
    await vscode.window.showTextDocument(document);
  } catch (error) {
    if (
      error.code === "FileNotFound" ||
      error.name === "EntryNotFound" ||
      String(error.message || "").includes("ENOENT")
    ) {
      vscode.window.showInformationMessage("No commit generation history yet.");
      return;
    }

    console.error("[Ollama Commit Maker] Failed to open history", error);
    vscode.window.showErrorMessage(
      `Ollama Commit Maker: ${error.message || "Unable to open history."}`
    );
  }
}

function activate(context) {
  void detectConfiguredRtk();

  const generateCommand = vscode.commands.registerCommand(
    GENERATE_COMMAND,
    () => generateCommitMessage(context)
  );
  const openHistoryCommand = vscode.commands.registerCommand(
    OPEN_HISTORY_COMMAND,
    () => openHistory(context)
  );

  context.subscriptions.push(generateCommand, openHistoryCommand);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
