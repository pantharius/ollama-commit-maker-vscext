"use strict";

const { execFile } = require("child_process");
const vscode = require("vscode");

const GIT_MAX_BUFFER = 20 * 1024 * 1024;

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        maxBuffer: GIT_MAX_BUFFER,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr?.trim() || error.message;
          reject(new Error(`Git command failed: ${detail}`));
          return;
        }

        resolve(stdout);
      }
    );
  });
}

async function getGitApi() {
  const gitExtension = vscode.extensions.getExtension("vscode.git");

  if (!gitExtension) {
    throw new Error("VS Code Git extension (vscode.git) is not available.");
  }

  if (!gitExtension.isActive) {
    try {
      await gitExtension.activate();
    } catch (error) {
      throw new Error(
        `VS Code Git extension could not be activated: ${error.message}`
      );
    }
  }

  if (
    !gitExtension.exports ||
    typeof gitExtension.exports.getAPI !== "function"
  ) {
    throw new Error("VS Code Git extension API is not available.");
  }

  const gitApi = gitExtension.exports.getAPI(1);

  if (!gitApi) {
    throw new Error("VS Code Git extension returned an empty API.");
  }

  return gitApi;
}

async function getRepository() {
  const gitApi = await getGitApi();
  const repositories = Array.isArray(gitApi.repositories)
    ? gitApi.repositories
    : [];

  console.log(
    `[Ollama Commit Maker] Git repositories found: ${repositories.length}`
  );

  if (repositories.length === 0) {
    throw new Error("No Git repository found.");
  }

  // TODO: Choose the active repository or the repository with staged changes.
  const repository = repositories[0];
  const rootUri = repository.rootUri?.fsPath || repository.rootUri?.toString();

  console.log(
    `[Ollama Commit Maker] Selected repository rootUri: ${
      rootUri || "(unknown)"
    }`
  );

  return repository;
}

function ensureCommitInput(repository) {
  if (!repository || !repository.inputBox) {
    throw new Error("Selected Git repository does not expose an inputBox.");
  }
}

function getCommitInput(repository) {
  ensureCommitInput(repository);

  const currentInput = repository.inputBox.value || "";

  console.log(`[Ollama Commit Maker] Previous commit input: ${currentInput}`);

  return currentInput;
}

function setCommitInput(repository, value) {
  ensureCommitInput(repository);

  repository.inputBox.value = value;

  console.log(`[Ollama Commit Maker] New commit input: ${value}`);
}

function getRepositoryRoot(repository) {
  const rootPath = repository?.rootUri?.fsPath;

  if (!rootPath) {
    throw new Error("Selected Git repository does not expose a root path.");
  }

  console.log(`[Ollama Commit Maker] Repository root: ${rootPath}`);

  return rootPath;
}

async function getStagedFiles(rootPath) {
  const stdout = await execFileAsync(
    "git",
    ["diff", "--staged", "--name-status"],
    { cwd: rootPath }
  );
  const stagedFiles = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (stagedFiles.length === 0) {
    throw new Error("No staged files found.");
  }

  console.log(`[Ollama Commit Maker] Staged files: ${stagedFiles.length}`);

  return stagedFiles;
}

async function getStagedDiff(rootPath) {
  const diff = await execFileAsync(
    "git",
    ["diff", "--staged", "--minimal", "--no-ext-diff"],
    { cwd: rootPath }
  );

  if (!diff.trim()) {
    throw new Error("Staged diff is empty or unexpected.");
  }

  return diff;
}

module.exports = {
  getGitApi,
  getRepository,
  getCommitInput,
  setCommitInput,
  getRepositoryRoot,
  getStagedFiles,
  getStagedDiff,
};
