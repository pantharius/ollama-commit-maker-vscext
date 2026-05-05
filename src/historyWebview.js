"use strict";

const fs = require("fs");
const vscode = require("vscode");
const {
  readHistoryEntries,
  getHistoryEntryById,
  getHistoryFileUri,
} = require("./history");
const { getRepository, setCommitInput } = require("./git");

const HISTORY_DIFF_SCHEME = "ollama-commit-maker-history";

let historyPanel = null;
let diffProviderRegistered = false;
const diffDocumentContents = new Map();

function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let value = "";

  for (let index = 0; index < 32; index += 1) {
    value += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return value;
}

function ensureDiffProvider(context) {
  if (diffProviderRegistered) {
    return;
  }

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(HISTORY_DIFF_SCHEME, {
      provideTextDocumentContent(uri) {
        return diffDocumentContents.get(uri.toString()) || "";
      },
    })
  );
  diffProviderRegistered = true;
}

async function openHistoryWebview(context) {
  ensureDiffProvider(context);

  if (historyPanel) {
    historyPanel.reveal(vscode.ViewColumn.One);
    await refreshOpenHistory(context, "command");
    return;
  }

  const distUri = vscode.Uri.joinPath(context.extensionUri, "webview", "dist");

  historyPanel = vscode.window.createWebviewPanel(
    "ollamaCommitMaker.history",
    "Commit Generation History",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [distUri],
    }
  );

  historyPanel.onDidDispose(() => {
    historyPanel = null;
  });
  historyPanel.webview.onDidReceiveMessage((message) =>
    handleWebviewMessage(context, message)
  );
  historyPanel.webview.html = getHistoryHtml(historyPanel.webview, context);
  await refreshOpenHistory(context, "created");
}

async function refreshOpenHistory(context, reason = "refresh") {
  if (!historyPanel) {
    return;
  }

  await refreshHistoryPanel(context, historyPanel, reason);
}

async function handleWebviewMessage(context, message) {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "ready" || message.type === "refreshHistory") {
    await refreshOpenHistory(context, message.type);
    return;
  }

  if (message.type === "openDiffInEditor") {
    await openHistoryDiffInEditor(context, message.id);
    return;
  }

  if (message.type === "copyGeneratedMessage") {
    await copyEntryField(context, message.id, "generated");
    return;
  }

  if (message.type === "restoreGeneratedMessage") {
    await restoreGeneratedMessage(context, message.id);
    return;
  }

  if (message.type === "copyPrompt") {
    await copyEntryField(context, message.id, "prompt");
    return;
  }

  if (message.type === "copyRawResponse") {
    await copyEntryField(context, message.id, "rawResponse");
    return;
  }

  if (message.type === "copyDiff") {
    await copyEntryField(context, message.id, "diff");
  }
}

async function refreshHistoryPanel(context, panel, reason) {
  const historyFileUri = getHistoryFileUri(context);

  console.log(`[Ollama Commit Maker] History refresh requested: ${reason}`);
  console.log(`[Ollama Commit Maker] History file: ${historyFileUri.fsPath}`);

  try {
    const entries = await readHistoryEntries(context, {
      limit: 100,
      throwOnError: true,
    });
    const loadedAt = new Date().toISOString();

    console.log(`[Ollama Commit Maker] History entries read: ${entries.length}`);
    console.log(
      `[Ollama Commit Maker] First history entry id: ${entries[0]?.id || "<none>"}`
    );

    await panel.webview.postMessage({
      type: "historyData",
      entries,
      loadedAt,
    });
  } catch (error) {
    const message = error.message || String(error);

    console.error("[Ollama Commit Maker] Failed to refresh history", error);
    vscode.window.showErrorMessage(`Ollama Commit Maker: ${message}`);

    await panel.webview.postMessage({
      type: "historyError",
      error: message,
    });
  }
}

async function openHistoryDiffInEditor(context, id) {
  const entry = await getHistoryEntryById(context, id);
  const diff = getEntryDisplayDiff(entry);

  if (!diff.trim()) {
    vscode.window.showInformationMessage("No diff recorded for this history entry.");
    return;
  }

  const files = parseGitDiffFiles(diff);

  if (files.length === 0) {
    await openRawPatchDocument(id, diff);
    return;
  }

  const selectedFile =
    files.length === 1
      ? files[0]
      : await vscode.window.showQuickPick(
          files.map((file) => ({
            label: file.displayPath,
            description: `${file.oldLines.length} -> ${file.newLines.length} lines`,
            file,
          })),
          {
            title: "Open history diff",
            placeHolder: "Select a file from the saved patch",
          }
        );
  const file = selectedFile?.file || selectedFile;

  if (!file) {
    return;
  }

  await openSyntheticDiffDocument(id, file);
}

async function openRawPatchDocument(id, diff) {
  const uri = createHistoryDiffUri(id, "patch", "history.patch");
  diffDocumentContents.set(uri.toString(), diff);

  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.One,
  });
}

async function openSyntheticDiffDocument(id, file) {
  const leftUri = createHistoryDiffUri(id, "before", file.displayPath);
  const rightUri = createHistoryDiffUri(id, "after", file.displayPath);

  diffDocumentContents.set(leftUri.toString(), file.oldLines.join("\n"));
  diffDocumentContents.set(rightUri.toString(), file.newLines.join("\n"));

  await vscode.commands.executeCommand(
    "vscode.diff",
    leftUri,
    rightUri,
    `History diff: ${file.displayPath}`,
    { preview: false }
  );
}

function createHistoryDiffUri(id, side, filePath) {
  const safeId = encodeURIComponent(id || "unknown");
  const safePath = String(filePath || "history.diff")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");

  return vscode.Uri.from({
    scheme: HISTORY_DIFF_SCHEME,
    path: `/${side}/${safePath}`,
    query: `id=${safeId}&side=${encodeURIComponent(side)}`,
  });
}

function parseGitDiffFiles(diff) {
  return String(diff || "")
    .split(/(?=^diff --git )/m)
    .map(parseGitDiffFile)
    .filter(Boolean);
}

function parseGitDiffFile(section) {
  const lines = String(section || "").split(/\r?\n/);
  const gitHeader = lines[0]?.match(/^diff --git a\/(.+) b\/(.+)$/);
  let oldPath = gitHeader?.[1] || "";
  let newPath = gitHeader?.[2] || "";
  const oldLines = [];
  const newLines = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("--- ")) {
      oldPath = normalizeDiffPath(line.slice(4), oldPath);
      continue;
    }

    if (line.startsWith("+++ ")) {
      newPath = normalizeDiffPath(line.slice(4), newPath);
      continue;
    }

    if (line.startsWith("@@")) {
      inHunk = true;
      oldLines.push(line);
      newLines.push(line);
      continue;
    }

    if (!inHunk || line === "\\ No newline at end of file") {
      continue;
    }

    if (line.startsWith("+")) {
      newLines.push(line.slice(1));
      continue;
    }

    if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
      continue;
    }

    const content = line.startsWith(" ") ? line.slice(1) : line;
    oldLines.push(content);
    newLines.push(content);
  }

  const displayPath = newPath && newPath !== "/dev/null" ? newPath : oldPath;

  if (!displayPath || (oldLines.length === 0 && newLines.length === 0)) {
    return null;
  }

  return {
    displayPath,
    oldLines,
    newLines,
  };
}

function normalizeDiffPath(value, fallback) {
  const pathValue = String(value || "").trim();

  if (!pathValue || pathValue === "/dev/null") {
    return pathValue || fallback || "";
  }

  return pathValue.replace(/^[ab]\//, "");
}

async function copyEntryField(context, id, field) {
  const entry = await getHistoryEntryById(context, id);

  if (!entry) {
    vscode.window.showErrorMessage("Ollama Commit Maker: history entry not found.");
    return;
  }

  const values = {
    generated: entry.output?.cleanedCommitMessage || "",
    prompt: entry.prompt?.full || "",
    diff: getEntryDisplayDiff(entry),
    rawResponse: entry.output?.rawResponse || "",
  };
  const value = values[field] || "";

  if (!value) {
    vscode.window.showInformationMessage("Nothing to copy.");
    return;
  }

  await vscode.env.clipboard.writeText(value);
  vscode.window.showInformationMessage("Copied to clipboard.");
}

function getEntryDisplayDiff(entry) {
  return entry?.input?.diffFull || entry?.input?.diffSent || "";
}

async function restoreGeneratedMessage(context, id) {
  const entry = await getHistoryEntryById(context, id);
  const message = entry?.output?.cleanedCommitMessage || "";

  if (!message) {
    vscode.window.showErrorMessage("Ollama Commit Maker: no generated message to restore.");
    return;
  }

  const repository = await getRepository();
  setCommitInput(repository, message);
  vscode.window.showInformationMessage("Commit message restored.");
}

function getHistoryHtml(webview, context) {
  const nonce = getNonce();
  const assets = getWebviewAssets(context, webview);
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
  ].join("; ");

  if (!assets.scriptUri) {
    return getMissingBuildHtml(csp);
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  ${assets.styleUri ? `<link rel="stylesheet" href="${assets.styleUri}">` : ""}
  <title>Commit Generation History</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${assets.scriptUri}"></script>
</body>
</html>`;
}

function getMissingBuildHtml(csp) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
</head>
<body>
  <h1>Commit Generation History</h1>
  <p>Webview build assets are missing. Run <code>npm run webview:build</code>.</p>
</body>
</html>`;
}

function getWebviewAssets(context, webview) {
  const assetsDir = vscode.Uri.joinPath(
    context.extensionUri,
    "webview",
    "dist",
    "assets"
  );
  let files = [];

  try {
    files = fs.readdirSync(assetsDir.fsPath);
  } catch (error) {
    console.error("[Ollama Commit Maker] Webview assets not found", error);
    return {
      scriptUri: null,
      styleUri: null,
    };
  }

  const script = files.find((file) => file.endsWith(".js"));
  const style = files.find((file) => file.endsWith(".css"));

  return {
    scriptUri: script
      ? webview.asWebviewUri(vscode.Uri.joinPath(assetsDir, script))
      : null,
    styleUri: style
      ? webview.asWebviewUri(vscode.Uri.joinPath(assetsDir, style))
      : null,
  };
}

module.exports = {
  openHistoryWebview,
  refreshOpenHistory,
};
