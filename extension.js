"use strict";

const vscode = require("vscode");

const GENERATE_COMMAND = "ollamaCommitMaker.generateCommitMessage";
const OPEN_HISTORY_COMMAND = "ollamaCommitMaker.openHistory";

function showGenerateRegisteredMessage() {
  vscode.window.showInformationMessage(
    "Ollama Commit Maker: generate command registered."
  );
}

function showHistoryRegisteredMessage() {
  vscode.window.showInformationMessage(
    "Ollama Commit Maker: history command registered."
  );
}

function activate(context) {
  const generateCommand = vscode.commands.registerCommand(
    GENERATE_COMMAND,
    showGenerateRegisteredMessage
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
