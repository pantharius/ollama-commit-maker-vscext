import type { HistoryEntry } from "../types";

type StatusFilter = "all" | "success" | "error";
type SourceFilter = "all" | "git" | "rtk";

interface Props {
  entries: HistoryEntry[];
  filteredEntries: HistoryEntry[];
  search: string;
  statusFilter: StatusFilter;
  sourceFilter: SourceFilter;
  loadedAt: string | null;
  error: string | null;
  onSearchChange(value: string): void;
  onStatusFilterChange(value: StatusFilter): void;
  onSourceFilterChange(value: SourceFilter): void;
  onRefresh(): void;
  onOpen(entry: HistoryEntry): void;
}

function getStatus(entry: HistoryEntry): "success" | "error" | "unknown" {
  if (entry.status?.success === true) return "success";
  if (entry.status?.success === false) return "error";
  return "unknown";
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDuration(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function text(value: unknown, fallback = "-"): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function truncate(value: unknown, fallback = "-", maxLength = 120): string {
  const normalized = text(value, fallback).replace(/\s+/g, " ");
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}

export function HistoryList({
  entries,
  filteredEntries,
  search,
  statusFilter,
  sourceFilter,
  loadedAt,
  error,
  onSearchChange,
  onStatusFilterChange,
  onSourceFilterChange,
  onRefresh,
  onOpen,
}: Props) {
  return (
    <main className="history-app">
      <header className="app-header list-header">
        <div>
          <h1>Commit Generation History</h1>
          <p>
            Showing {filteredEntries.length} / {entries.length} traces
            {loadedAt ? ` - refreshed ${formatDate(loadedAt)}` : ""}
          </p>
        </div>
        <div className="toolbar">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            type="search"
            placeholder="Search input, output, files, model"
          />
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
            aria-label="Status filter"
          >
            <option value="all">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(event) => onSourceFilterChange(event.target.value as SourceFilter)}
            aria-label="Diff source filter"
          >
            <option value="all">All sources</option>
            <option value="git">Git</option>
            <option value="rtk">RTK</option>
          </select>
          <button type="button" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="error-banner">{error}</div> : null}

      <section className="history-list" aria-label="Commit generation traces">
        {filteredEntries.length === 0 ? (
          <div className="empty-state">
            {entries.length === 0 ? "No commit generation history yet." : "No traces match the current filters."}
          </div>
        ) : (
          <>
            <div className="history-columns" aria-hidden="true">
              <span>Status</span>
              <span>Input / Generated</span>
              <div className="row-meta header-meta">
                <span>Date</span>
                <span>Files</span>
                <span className="hide-narrow">Source</span>
                <span className="hide-narrow">Model</span>
                <span className="hide-narrow">Duration</span>
              </div>
              <span>Action</span>
            </div>
            {filteredEntries.map((entry) => {
              const status = getStatus(entry);
              const generated = entry.output?.cleanedCommitMessage || entry.status?.error || "<none>";
              const input = entry.input?.commitMessage || "<empty>";

              return (
                <article className="history-row" key={entry.id || `${entry.createdAt}-${generated}`}>
                  <div className="row-status">
                    <span className={`status-pill ${status}`}>{status}</span>
                  </div>
                  <div className="row-main">
                    <span className="input-line" title={input}>
                      {truncate(input, "<empty>", 140)}
                    </span>
                    <strong title={generated}>{truncate(generated, "<none>", 160)}</strong>
                  </div>
                  <div className="row-meta">
                    <span>{formatDate(entry.createdAt)}</span>
                    <span>{entry.input?.stagedFilesCount || 0} files</span>
                    <span className="hide-narrow">{entry.input?.diffSource || "-"}</span>
                    <span className="hide-narrow">{entry.ollama?.model || "<unknown>"}</span>
                    <span className="hide-narrow">{formatDuration(entry.status?.durationMs)}</span>
                  </div>
                  <button type="button" className="open-button" onClick={() => onOpen(entry)} disabled={!entry.id}>
                    Open
                  </button>
                </article>
              );
            })}
          </>
        )}
      </section>
    </main>
  );
}
