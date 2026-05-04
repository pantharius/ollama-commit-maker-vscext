"use strict";

const vscode = acquireVsCodeApi();

let entries = [];
let filteredEntries = [];
let selectedEntryId = null;
let view = "list";
let activeTab = "summary";

const elements = {
  app: document.querySelector(".commit-history-app"),
  traceCount: document.getElementById("traceCount"),
  searchInput: document.getElementById("searchInput"),
  statusFilter: document.getElementById("statusFilter"),
  sourceFilter: document.getElementById("sourceFilter"),
  refreshButton: document.getElementById("refreshButton"),
  listView: document.getElementById("listView"),
  historyRows: document.getElementById("historyRows"),
  emptyState: document.getElementById("emptyState"),
  detailView: document.getElementById("detailView"),
  detailContent: document.getElementById("detailContent"),
  initialHistoryData: document.getElementById("initialHistoryData"),
};

function reportFatalError(error) {
  const message = error?.message || String(error);
  console.error(`[Ollama Commit Maker Webview] ${message}`, error);

  const fallback = document.createElement("pre");
  fallback.style.whiteSpace = "pre-wrap";
  fallback.style.padding = "16px";
  fallback.style.color = "var(--vscode-errorForeground)";
  fallback.textContent = `Unable to render commit generation history.\n\n${message}`;
  document.body.replaceChildren(fallback);
}

function requireElement(name, element) {
  if (!element) {
    throw new Error(`Missing Webview element: ${name}`);
  }

  return element;
}

function validateElements() {
  for (const [name, element] of Object.entries(elements)) {
    requireElement(name, element);
  }
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDuration(value) {
  if (!Number.isFinite(value)) return "-";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function formatDiffSize(entry) {
  const length = entry?.input?.diffSentLength || 0;
  const unit = length >= 1000 ? `${(length / 1000).toFixed(1)}k` : String(length);
  return `${unit} chars`;
}

function truncate(value, maxLength = 90) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "-";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function getStatus(entry) {
  if (entry?.status?.success === true) return "success";
  if (entry?.status?.success === false) return "error";
  return "unknown";
}

function getSelectedEntry() {
  return entries.find((entry) => getEntryId(entry) === selectedEntryId) || null;
}

function getEntryId(entry) {
  return entry?.id || "";
}

function getSearchText(entry) {
  return [
    entry?.input?.commitMessage,
    entry?.output?.cleanedCommitMessage,
    entry?.input?.stagedFilesRaw,
    entry?.ollama?.model,
  ]
    .join("\n")
    .toLowerCase();
}

function createElement(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createBadge(text, className, title) {
  const badge = createElement("span", `badge ${className || ""}`.trim(), text || "-");
  badge.title = title || text || "";
  return badge;
}

function createButton(label, className, onClick) {
  const button = createElement("button", className || "", label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

function createCell(content, className, title) {
  const cell = document.createElement("td");
  if (className) cell.className = className;

  if (content instanceof Node) {
    cell.appendChild(content);
    return cell;
  }

  const span = createElement("span", "cell-ellipsis", content || "-");
  span.title = title || content || "";
  cell.appendChild(span);
  return cell;
}

function postMessage(type, payload = {}) {
  vscode.postMessage({ type, ...payload });
}

function applyFilters() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const status = elements.statusFilter.value || "all";
  const source = elements.sourceFilter.value || "all";

  filteredEntries = entries.filter((entry) => {
    const matchesSearch = !search || getSearchText(entry).includes(search);
    const matchesStatus = status === "all" || getStatus(entry) === status;
    const entrySource = entry?.input?.diffSource || "";
    const matchesSource = source === "all" || entrySource === source;
    return matchesSearch && matchesStatus && matchesSource;
  });

  elements.traceCount.textContent = `${filteredEntries.length} of ${entries.length} traces`;
  console.log(
    `[Ollama Commit Maker Webview] entries=${entries.length}, filtered=${filteredEntries.length}, view=${view}, selected=${selectedEntryId || "<none>"}`
  );

  if (
    view === "detail" &&
    !filteredEntries.some((entry) => getEntryId(entry) === selectedEntryId)
  ) {
    showListView();
  }

  renderList();
}

function renderList() {
  elements.historyRows.replaceChildren();
  elements.emptyState.hidden = filteredEntries.length > 0;

  for (const entry of filteredEntries) {
    const row = document.createElement("tr");
    const entryId = getEntryId(entry);
    const status = getStatus(entry);
    const input = entry?.input?.commitMessage || "<empty>";
    const generated = entry?.output?.cleanedCommitMessage || entry?.status?.error || "<none>";
    const model = entry?.ollama?.model || "<unknown>";
    const source = entry?.input?.diffSource || "-";

    row.className = entryId && entryId === selectedEntryId ? "selected" : "";
    row.tabIndex = 0;
    row.addEventListener("click", () => openEntry(entryId));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openEntry(entryId);
      }
    });

    const openButton = createButton("Open", "link-button", (event) => {
      event.stopPropagation();
      openEntry(entryId);
    });
    openButton.disabled = !entryId;

    row.append(
      createCell(formatDate(entry.createdAt), "date-cell", entry.createdAt),
      createCell(createBadge(status, status), "status-cell"),
      createCell(truncate(input, 72), "", input),
      createCell(truncate(generated, 86), "", generated),
      createCell(String(entry?.input?.stagedFilesCount || 0), "number"),
      createCell(createBadge(source, "source", source), "source-cell"),
      createCell(createBadge(model, "model", model), "model-cell"),
      createCell(formatDuration(entry?.status?.durationMs), "number"),
      createCell(openButton, "action-cell")
    );

    elements.historyRows.appendChild(row);
  }
}

function openEntry(id) {
  if (!id) return;

  selectedEntryId = id;
  view = "detail";
  activeTab = "summary";
  renderList();
  renderShell();
}

function showListView() {
  view = "list";
  renderShell();
}

function renderShell() {
  elements.app.dataset.view = view;
  elements.listView.hidden = view !== "list";
  elements.detailView.hidden = view !== "detail";

  if (view === "detail") {
    renderDetail();
  } else {
    elements.detailContent.replaceChildren();
  }
}

function createSection(title, actions) {
  const section = createElement("section", "detail-section");
  const header = createElement("div", "section-header");
  const heading = createElement("h2", "", title);

  header.appendChild(heading);
  if (actions) header.appendChild(actions);
  section.appendChild(header);
  return section;
}

function appendPre(section, value, className = "") {
  const pre = createElement("pre", `code-block ${className}`.trim());
  pre.textContent = value || "<empty>";
  section.appendChild(pre);
}

function createSectionActions() {
  return createElement("div", "section-actions");
}

function appendCopyButton(container, label, type, id) {
  container.appendChild(createButton(label, "", () => postMessage(type, { id })));
}

function appendSummaryCards(container, entry) {
  const cards = createElement("div", "summary-cards");

  for (const [label, value, className] of [
    ["Status", getStatus(entry), getStatus(entry)],
    ["Duration", formatDuration(entry?.status?.durationMs), ""],
    ["Model", entry?.ollama?.model || "-", "model"],
    ["Ollama URL", entry?.ollama?.url || "-", ""],
    ["Source", entry?.input?.diffSource || "-", "source"],
    ["Files", String(entry?.input?.stagedFilesCount || 0), ""],
    ["Diff", formatDiffSize(entry), ""],
    ["Truncated", entry?.input?.diffWasTruncated ? "yes" : "no", ""],
  ]) {
    const card = createElement("div", "summary-card");
    const labelNode = createElement("span", "", label);
    const valueNode = createElement("strong", className, value);

    valueNode.title = value;
    card.append(labelNode, valueNode);
    cards.appendChild(card);
  }

  container.appendChild(cards);
}

function appendKeyValueGrid(container, rows) {
  const grid = createElement("dl", "summary-grid");

  for (const [label, value] of rows) {
    const term = createElement("dt", "", label);
    const description = createElement("dd", "", value || "-");
    grid.append(term, description);
  }

  container.appendChild(grid);
}

function getFileStatusMeta(status) {
  const key = String(status || "").charAt(0).toUpperCase();
  const map = {
    A: { label: "A", className: "added", name: "Added" },
    M: { label: "M", className: "modified", name: "Modified" },
    D: { label: "D", className: "deleted", name: "Deleted" },
    R: { label: "R", className: "renamed", name: "Renamed" },
    C: { label: "C", className: "copied", name: "Copied" },
    U: { label: "U", className: "conflict", name: "Conflict" },
  };
  return map[key] || { label: key || "?", className: "conflict", name: "Unknown" };
}

function parseDiffFileStats(diff) {
  const stats = new Map();
  let current = null;

  for (const line of String(diff || "").split(/\r?\n/)) {
    const header = line.match(/^diff --git a\/(.+) b\/(.+)$/);

    if (header) {
      current = { oldPath: header[1], newPath: header[2], added: 0, deleted: 0 };
      stats.set(current.oldPath, current);
      stats.set(current.newPath, current);
      continue;
    }

    if (!current) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) current.added += 1;
    if (line.startsWith("-") && !line.startsWith("---")) current.deleted += 1;
  }

  return stats;
}

function parseStagedFiles(raw, diff) {
  const diffStats = parseDiffFileStats(diff);

  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/);
      const status = parts[0] || "";
      const isRename = status.toUpperCase().startsWith("R");
      const filePath = isRename && parts.length >= 3
        ? `${parts[1]} -> ${parts[2]}`
        : parts.slice(1).join(" -> ") || line;
      const stats = diffStats.get(parts[2]) || diffStats.get(parts[1]) || null;

      return { status, path: filePath, stats };
    });
}

function appendStagedFiles(container, raw, diff) {
  const files = parseStagedFiles(raw, diff);

  if (files.length === 0) {
    container.appendChild(createElement("p", "muted", "No staged files recorded."));
    return;
  }

  const list = createElement("div", "file-list");

  for (const file of files) {
    const meta = getFileStatusMeta(file.status);
    const row = createElement("div", "file-row");
    const status = createElement("span", `file-status ${meta.className}`, meta.label);
    const filePath = createElement("span", "file-path", file.path);
    const fileStats = createElement("span", "file-stats");

    status.title = `${meta.name} (${file.status})`;
    filePath.title = file.path;

    if (file.stats) {
      const added = createElement("span", "added", `+${file.stats.added}`);
      const deleted = createElement("span", "deleted", `-${file.stats.deleted}`);
      fileStats.append(added, deleted);
    }

    row.append(status, filePath, fileStats);
    list.appendChild(row);
  }

  container.appendChild(list);
}

function appendGeneratedMessage(container, entry) {
  const actions = createSectionActions();
  appendCopyButton(actions, "Copy", "copyGeneratedMessage", entry.id);
  actions.appendChild(
    createButton("Restore to commit box", "", () =>
      postMessage("restoreGeneratedMessage", { id: entry.id })
    )
  );

  const section = createSection("Generated commit message", actions);
  const message = createElement("pre", "generated-message");
  message.textContent = entry?.output?.cleanedCommitMessage || "<empty>";
  section.appendChild(message);
  container.appendChild(section);
}

function renderSummaryTab(entry) {
  const fragment = document.createDocumentFragment();
  const summary = createSection("Trace summary");
  appendSummaryCards(summary, entry);
  appendKeyValueGrid(summary, [
    ["Date", formatDate(entry.createdAt)],
    ["Repository", entry?.repository?.rootPath],
    ["Branch", entry?.repository?.branch],
    ["Workspace", entry?.repository?.workspaceName],
    ["Error", entry?.status?.error],
  ]);

  const initial = createSection("Initial commit input");
  appendPre(initial, entry?.input?.commitMessage);

  const files = createSection("Staged files");
  appendStagedFiles(files, entry?.input?.stagedFilesRaw, entry?.input?.diffSent);

  fragment.append(summary, initial);
  appendGeneratedMessage(fragment, entry);
  fragment.appendChild(files);
  return fragment;
}

function renderDiffTab(entry) {
  const fragment = document.createDocumentFragment();
  const actions = createSectionActions();
  const section = createSection("Diff sent", actions);
  const panel = createElement("div", "diff-open-panel");
  const meta = createElement("div", "diff-meta");
  const note = createElement(
    "p",
    "diff-note",
    "Open the saved patch in VS Code's native diff editor. History traces store patch hunks, so the editor shows the recorded before/after hunks rather than a full repository snapshot."
  );

  actions.append(
    createButton("Open in VS Code diff editor", "", () =>
      postMessage("openDiffInEditor", { id: entry.id })
    ),
    createButton("Copy diff", "", () => postMessage("copyDiff", { id: entry.id }))
  );

  meta.append(
    createBadge(entry?.input?.diffSource || "-", "source"),
    createBadge(entry?.input?.diffWasTruncated ? "truncated" : "complete", "model"),
    createBadge(formatDiffSize(entry), "model")
  );

  panel.append(meta, note);

  if (!entry?.input?.diffSent) {
    panel.appendChild(createElement("p", "muted", "No diff recorded."));
  } else {
    const files = createElement("div", "diff-files");
    files.appendChild(createElement("h3", "", "Files in this diff"));
    appendStagedFiles(files, entry?.input?.stagedFilesRaw, entry?.input?.diffSent);
    section.append(panel, files);
    fragment.appendChild(section);
    return fragment;
  }

  section.appendChild(panel);
  fragment.appendChild(section);
  return fragment;
}

function renderPromptTab(entry) {
  const fragment = document.createDocumentFragment();
  const actions = createSectionActions();
  appendCopyButton(actions, "Copy prompt", "copyPrompt", entry.id);

  const system = createSection("System prompt");
  const user = createSection("User prompt");
  const full = createSection("Full prompt", actions);

  appendPre(system, entry?.prompt?.system);
  appendPre(user, entry?.prompt?.user);
  appendPre(full, entry?.prompt?.full);
  fragment.append(system, user, full);
  return fragment;
}

function renderResponseTab(entry) {
  const fragment = document.createDocumentFragment();
  const rawActions = createSectionActions();
  appendCopyButton(rawActions, "Copy response", "copyRawResponse", entry.id);

  const raw = createSection("Raw Ollama response", rawActions);
  appendPre(raw, entry?.output?.rawResponse);

  fragment.appendChild(raw);
  appendGeneratedMessage(fragment, entry);
  return fragment;
}

function renderStepsTab(entry) {
  const section = createSection("Generation steps");
  const table = createElement("table", "steps-table");
  const body = document.createElement("tbody");
  const head = document.createElement("thead");
  const header = document.createElement("tr");

  for (const label of ["Step", "Status", "Started", "Finished", "Duration", "Error"]) {
    header.appendChild(createElement("th", "", label));
  }

  head.appendChild(header);

  for (const step of entry.steps || []) {
    const row = document.createElement("tr");
    const started = Date.parse(step.startedAt || "");
    const finished = Date.parse(step.finishedAt || "");
    const duration = Number.isNaN(started) || Number.isNaN(finished)
      ? "-"
      : formatDuration(finished - started);

    row.append(
      createCell(step.label || step.name || "-"),
      createCell(createBadge(step.success === false ? "error" : "success", step.success === false ? "error" : "success")),
      createCell(formatDate(step.startedAt)),
      createCell(formatDate(step.finishedAt)),
      createCell(duration),
      createCell(step.error || "-")
    );
    body.appendChild(row);
  }

  table.append(head, body);
  section.appendChild(table);
  return section;
}

function renderTabs(entry) {
  const tabs = createElement("div", "tabs");
  const tabList = createElement("div", "tab-list");
  const content = createElement("div", "tab-content");

  for (const [id, label] of [
    ["summary", "Summary"],
    ["diff", "Diff"],
    ["prompt", "Prompt"],
    ["response", "Response"],
    ["steps", "Steps"],
  ]) {
    const tab = createButton(label, id === activeTab ? "tab active" : "tab", () => {
      activeTab = id;
      renderDetail();
    });
    tab.setAttribute("aria-pressed", id === activeTab ? "true" : "false");
    tabList.appendChild(tab);
  }

  if (activeTab === "summary") content.appendChild(renderSummaryTab(entry));
  if (activeTab === "diff") content.appendChild(renderDiffTab(entry));
  if (activeTab === "prompt") content.appendChild(renderPromptTab(entry));
  if (activeTab === "response") content.appendChild(renderResponseTab(entry));
  if (activeTab === "steps") content.appendChild(renderStepsTab(entry));

  tabs.append(tabList, content);
  return tabs;
}

function renderDetail() {
  const entry = getSelectedEntry();
  elements.detailContent.replaceChildren();

  if (!entry) {
    elements.detailContent.appendChild(
      createElement("div", "empty-state", "History entry not found.")
    );
    return;
  }

  const header = createElement("header", "detail-header");
  const titleWrap = createElement("div", "detail-title");
  const status = getStatus(entry);
  const title = entry?.output?.cleanedCommitMessage || entry?.status?.error || "Generation trace";

  titleWrap.append(
    createBadge(status, status),
    createElement("h1", "", truncate(title, 140)),
    createElement("p", "", `${formatDate(entry.createdAt)} - ${entry?.repository?.rootPath || "Unknown repository"}`)
  );
  header.append(
    createButton("Back to history", "secondary", showListView),
    titleWrap
  );

  elements.detailContent.append(header, renderTabs(entry));
}

function handleHistoryData(message) {
  try {
    entries = Array.isArray(message.entries) ? message.entries : [];
    console.log(`[Ollama Commit Maker Webview] received ${entries.length} history entries`);

    if (!entries.some((entry) => getEntryId(entry) === selectedEntryId)) {
      selectedEntryId = null;
    }

    applyFilters();
    renderShell();
  } catch (error) {
    reportFatalError(error);
  }
}

function hydrateInitialHistoryData() {
  if (!elements.initialHistoryData?.textContent) return;

  try {
    const parsedEntries = JSON.parse(elements.initialHistoryData.textContent);

    if (Array.isArray(parsedEntries) && entries.length === 0) {
      entries = parsedEntries;
      applyFilters();
      renderShell();
    }
  } catch (error) {
    console.error("[Ollama Commit Maker Webview] Failed to parse initial history data", error);
  }
}

try {
  validateElements();

  elements.searchInput.addEventListener("input", applyFilters);
  elements.statusFilter.addEventListener("change", applyFilters);
  elements.sourceFilter.addEventListener("change", applyFilters);
  elements.refreshButton.addEventListener("click", () => postMessage("refreshHistory"));
  elements.historyRows.addEventListener("click", (event) => {
    const target = event.target;
    const row = target instanceof Element ? target.closest("tr[data-entry-id]") : null;
    const id = row?.getAttribute("data-entry-id") || "";

    if (id) {
      openEntry(id);
    }
  });
  hydrateInitialHistoryData();
} catch (error) {
  reportFatalError(error);
}

window.addEventListener("message", (event) => {
  const message = event.data;

  if (message.type === "historyData") {
    handleHistoryData(message);
  }
});

try {
  postMessage("ready");
} catch (error) {
  reportFatalError(error);
}
