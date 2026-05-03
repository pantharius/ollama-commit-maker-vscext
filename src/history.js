"use strict";

const fs = require("fs");
const path = require("path");
const vscode = require("vscode");

function getHistoryFileUri(context) {
  const storageUri = context.storageUri || context.globalStorageUri;

  if (!storageUri) {
    throw new Error("Extension storage is not available.");
  }

  return vscode.Uri.joinPath(storageUri, "commit-history", "history.jsonl");
}

async function appendHistoryEntry(context, entry) {
  try {
    const historyFileUri = getHistoryFileUri(context);

    await fs.promises.mkdir(path.dirname(historyFileUri.fsPath), {
      recursive: true,
    });
    await fs.promises.appendFile(
      historyFileUri.fsPath,
      `${JSON.stringify(entry)}\n`,
      "utf8"
    );

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    console.error("[Ollama Commit Maker] Failed to write history entry", error);

    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

async function readHistoryEntries(context, options = {}) {
  try {
    const historyFileUri = getHistoryFileUri(context);
    const raw = await fs.promises.readFile(historyFileUri.fsPath, "utf8");
    const entries = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          console.error(
            "[Ollama Commit Maker] Ignoring invalid history line",
            error
          );
          return null;
        }
      })
      .filter(Boolean)
      .reverse();

    if (options.limit && Number.isFinite(options.limit)) {
      return entries.slice(0, options.limit);
    }

    return entries;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    console.error("[Ollama Commit Maker] Failed to read history entries", error);
    return [];
  }
}

module.exports = {
  appendHistoryEntry,
  readHistoryEntries,
  getHistoryFileUri,
};
