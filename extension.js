"use strict";

const vscode = require("vscode");
const {
  getRepository,
  getCommitInput,
  setCommitInput,
} = require("./src/git");

const GENERATE_COMMAND = "ollamaCommitMaker.generateCommitMessage";
const OPEN_HISTORY_COMMAND = "ollamaCommitMaker.openHistory";
const TEST_COMMIT_MESSAGE = "test: generated commit message";

async function generateCommitMessage() {
  try {
    const repository = await getRepository();

    getCommitInput(repository);
    setCommitInput(repository, TEST_COMMIT_MESSAGE);

    vscode.window.showInformationMessage(
      "Ollama Commit Maker: Git commit input read/write works."
    );
  } catch (error) {
    console.error("[Ollama Commit Maker] Failed to update commit input", error);
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
