import { useState } from "react";
import { DiffViewer } from "./DiffViewer";
import { PromptTab } from "./PromptTab";
import { StepsTab } from "./StepsTab";
import { SummaryTab } from "./SummaryTab";
import { postMessage } from "../vscode";
import type { HistoryEntry } from "../types";

interface Props {
  entry: HistoryEntry;
  onBack(): void;
  onRefresh(): void;
}

type TabId = "summary" | "diff" | "prompt" | "steps";

function getStatus(entry: HistoryEntry): "success" | "error" | "unknown" {
  if (entry.status?.success === true) return "success";
  if (entry.status?.success === false) return "error";
  return "unknown";
}

function truncate(value: unknown, maxLength = 160): string {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "Generation trace";
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function getTitle(entry: HistoryEntry): string {
  if (entry.output?.cleanedCommitMessage) {
    return entry.output.cleanedCommitMessage;
  }

  if (entry.status?.error) {
    return entry.status.error;
  }

  return getStatus(entry) === "error" ? "Generation failed" : "Generation trace";
}

function Icon({ name }: { name: "arrow-left" | "copy" | "refresh" }) {
  if (name === "arrow-left") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18l-6-6 6-6" />
      </svg>
    );
  }

  if (name === "copy") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M5 15V7a2 2 0 0 1 2-2h8" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M18 2v5h-5" />
      <path d="M6 22v-5h5" />
    </svg>
  );
}

export function TraceDetail({ entry, onBack, onRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const status = getStatus(entry);
  const title = getTitle(entry);

  return (
    <main className="history-app detail-app">
      <header className="app-header detail-header">
        <div className="detail-title">
          <span className={`status-pill ${status}`}>{status}</span>
          <h1 title={title}>{truncate(title)}</h1>
          <p>
            {formatDate(entry.createdAt)} -{" "}
            {entry.repository?.rootPath || "Unknown repository"}
          </p>
        </div>
        <div className="detail-actions" aria-label="Trace actions">
          <button
            type="button"
            className="icon-button"
            onClick={onBack}
            title="Back to history"
            aria-label="Back to history"
          >
            <Icon name="arrow-left" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() =>
              postMessage({ type: "copyGeneratedMessage", id: entry.id })
            }
            title="Copy generated commit message"
            aria-label="Copy generated commit message"
          >
            <Icon name="copy" />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onRefresh}
            title="Refresh history"
            aria-label="Refresh history"
          >
            <Icon name="refresh" />
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Trace detail tabs">
        {(
          [
            ["summary", "Summary"],
            ["diff", "Diff"],
            ["prompt", "Prompt"],
            ["steps", "Steps"],
          ] as Array<[TabId, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tab ${activeTab === id ? "active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="tab-panel">
        {activeTab === "summary" ? <SummaryTab entry={entry} /> : null}
        {activeTab === "diff" ? <DiffViewer entry={entry} /> : null}
        {activeTab === "prompt" ? <PromptTab entry={entry} /> : null}
        {activeTab === "steps" ? <StepsTab entry={entry} /> : null}
      </section>
    </main>
  );
}
