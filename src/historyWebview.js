"use strict";

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

function getWebviewUri(webview, extensionUri, ...segments) {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...segments));
}

function ensureDiffProvider(context) {
  if (diffProviderRegistered) {
    return;
  }

  const provider = {
    provideTextDocumentContent(uri) {
      return diffDocumentContents.get(uri.toString()) || "";
    },
  };

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      HISTORY_DIFF_SCHEME,
      provider
    )
  );
  diffProviderRegistered = true;
}

async function openHistoryWebview(context) {
  ensureDiffProvider(context);

  if (historyPanel) {
    historyPanel.reveal(vscode.ViewColumn.One);
    await postHistoryData(context, historyPanel);
    return;
  }

  const initialEntries = await readHistoryEntries(context, { limit: 100 });

  historyPanel = vscode.window.createWebviewPanel(
    "ollamaCommitMaker.history",
    "Commit Generation History",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    }
  );

  historyPanel.onDidDispose(() => {
    historyPanel = null;
  });
  historyPanel.webview.onDidReceiveMessage((message) =>
    handleWebviewMessage(context, historyPanel, message)
  );
  historyPanel.webview.html = getHistoryHtml(
    historyPanel.webview,
    context,
    initialEntries
  );
  await postHistoryData(context, historyPanel);
  setTimeout(() => {
    void postHistoryData(context, historyPanel);
  }, 250);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatInitialDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function truncateInitial(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function getInitialStatus(entry) {
  if (entry?.status?.success === true) return "success";
  if (entry?.status?.success === false) return "error";
  return "unknown";
}

function formatInitialDuration(value) {
  if (!Number.isFinite(value)) return "-";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function renderInitialRows(entries) {
  return entries
    .map((entry) => {
      const id = escapeHtml(entry?.id || "");
      const status = getInitialStatus(entry);
      const input = entry?.input?.commitMessage || "<empty>";
      const generated =
        entry?.output?.cleanedCommitMessage || entry?.status?.error || "<none>";
      const model = entry?.ollama?.model || "<unknown>";
      const source = entry?.input?.diffSource || "-";

      return `<tr data-entry-id="${id}">
        <td class="date-cell"><span class="cell-ellipsis" title="${escapeHtml(entry?.createdAt || "")}">${escapeHtml(formatInitialDate(entry?.createdAt))}</span></td>
        <td class="status-cell"><span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span></td>
        <td><span class="cell-ellipsis" title="${escapeHtml(input)}">${escapeHtml(truncateInitial(input, 72))}</span></td>
        <td><span class="cell-ellipsis" title="${escapeHtml(generated)}">${escapeHtml(truncateInitial(generated, 86))}</span></td>
        <td class="number"><span class="cell-ellipsis">${escapeHtml(entry?.input?.stagedFilesCount || 0)}</span></td>
        <td class="source-cell"><span class="badge source">${escapeHtml(source)}</span></td>
        <td class="model-cell"><span class="badge model" title="${escapeHtml(model)}">${escapeHtml(model)}</span></td>
        <td class="number"><span class="cell-ellipsis">${escapeHtml(formatInitialDuration(entry?.status?.durationMs))}</span></td>
        <td class="action-cell"><button class="link-button" type="button" data-open-entry="${id}" ${id ? "" : "disabled"}>Open</button></td>
      </tr>`;
    })
    .join("");
}

function serializeInitialEntries(entries) {
  return JSON.stringify(entries)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function handleWebviewMessage(context, panel, message) {
  if (!panel || !message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "ready" || message.type === "refreshHistory") {
    await postHistoryData(context, panel);
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

async function postHistoryData(context, panel) {
  const entries = await readHistoryEntries(context, { limit: 100 });
  const historyFileUri = getHistoryFileUri(context);

  console.log(`[Ollama Commit Maker] History file: ${historyFileUri.fsPath}`);
  console.log(`[Ollama Commit Maker] History entries read: ${entries.length}`);
  console.log(
    `[Ollama Commit Maker] First history entry id: ${entries[0]?.id || "<none>"}`
  );

  await panel.webview.postMessage({
    type: "historyData",
    entries,
  });
}

async function openHistoryDiffInEditor(context, id) {
  const entry = await getHistoryEntryById(context, id);
  const diff = entry?.input?.diffSent || "";

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
    diff: entry.input?.diffSent || "",
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

function getHistoryHtml(webview, context, initialEntries = []) {
  const nonce = getNonce();
  const scriptUri = getWebviewUri(webview, context.extensionUri, "media", "history.js");
  const styleUri = getWebviewUri(webview, context.extensionUri, "media", "history.css");
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
  ].join("; ");
  const initialRows = renderInitialRows(initialEntries);
  const initialTraceCount = `${initialEntries.length} of ${initialEntries.length} traces`;
  const emptyHidden = initialEntries.length > 0 ? "hidden" : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link rel="stylesheet" href="${styleUri}">
  <title>Commit Generation History</title>
</head>
<body>
  <main class="commit-history-app">
    <header class="toolbar">
      <div>
        <h1>Commit Generation History</h1>
        <p id="traceCount">${escapeHtml(initialTraceCount)}</p>
      </div>
      <div class="toolbar-actions">
        <input id="searchInput" type="search" placeholder="Search history">
        <select id="statusFilter" aria-label="Status filter">
          <option value="all">All statuses</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
        <select id="sourceFilter" aria-label="Diff source filter">
          <option value="all">All sources</option>
          <option value="git">Git</option>
          <option value="rtk">RTK</option>
        </select>
        <button id="refreshButton" type="button">Refresh</button>
      </div>
    </header>
    <section id="listView" class="history-screen" aria-label="Generation history">
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th class="date-col">Date</th>
              <th class="status-col">Status</th>
              <th>Input</th>
              <th>Generated</th>
              <th class="files-col">Files</th>
              <th class="source-col">Source</th>
              <th class="model-col">Model</th>
              <th class="duration-col">Duration</th>
              <th class="action-col">Open</th>
            </tr>
          </thead>
          <tbody id="historyRows">${initialRows}</tbody>
        </table>
      </div>
      <div id="emptyState" class="empty-state" ${emptyHidden}>No commit generation history yet.</div>
    </section>
    <section id="detailView" class="detail-screen" aria-live="polite" hidden>
      <div id="detailContent" class="detail-inner"></div>
    </section>
    <script id="initialHistoryData" type="application/json">${serializeInitialEntries(initialEntries)}</script>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

module.exports = {
  openHistoryWebview,
};
