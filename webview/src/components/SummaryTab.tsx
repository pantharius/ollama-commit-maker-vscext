import type { HistoryEntry, StagedFileItem } from "../types";
import type { ReactNode } from "react";

interface Props {
  entry: HistoryEntry;
}

function getDisplayDiff(entry: HistoryEntry): string {
  return entry.input?.diffFull || entry.input?.diffSent || "";
}

function formatDuration(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "-";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

function parseDiffFileStats(diff: string): Map<string, { added: number; deleted: number }> {
  const stats = new Map<string, { added: number; deleted: number }>();
  let current: { oldPath: string; newPath: string; added: number; deleted: number } | null = null;

  for (const line of diff.split(/\r?\n/)) {
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

function parseStagedFiles(raw = "", diff = ""): StagedFileItem[] {
  const diffStats = parseDiffFileStats(diff);

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t+/);
      const status = parts[0] || "";
      const isRename = status.toUpperCase().startsWith("R");
      const oldPath = parts[1];
      const newPath = parts[2];
      const path = isRename && oldPath && newPath
        ? `${oldPath} -> ${newPath}`
        : parts.slice(1).join(" -> ") || line;
      const stats = diffStats.get(newPath) || diffStats.get(oldPath) || null;

      return {
        status,
        path,
        oldPath,
        newPath,
        added: stats?.added,
        deleted: stats?.deleted,
      };
    });
}

function statusClass(status: string): string {
  const key = status.charAt(0).toUpperCase();
  const map: Record<string, string> = {
    A: "added",
    M: "modified",
    D: "deleted",
    R: "renamed",
    C: "copied",
    U: "conflict",
  };
  return map[key] || "unknown";
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() || "?";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="detail-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function SummaryTab({ entry }: Props) {
  const diff = getDisplayDiff(entry);
  const files = parseStagedFiles(entry.input?.stagedFilesRaw, diff);
  const rawResponse = entry.output?.rawResponse || "";
  const generated = entry.output?.cleanedCommitMessage || "";
  const showRaw = rawResponse && rawResponse.trim() !== generated.trim();

  const cards = [
    ["Duration", formatDuration(entry.status?.durationMs)],
    ["Model", entry.ollama?.model || "-"],
    ["Source", entry.input?.diffSource || "-"],
    ["Files", String(entry.input?.stagedFilesCount || 0)],
    ["Full diff", `${diff.length} chars`],
    ["Sent diff", `${entry.input?.diffSentLength || 0} chars`],
    ["Truncated", entry.input?.diffWasTruncated ? "yes" : "no"],
    ["Ollama URL", entry.ollama?.url || "-"],
  ].filter(([, value]) => value && value !== "-");

  return (
    <div className="detail-stack">
      <Section title="Trace summary">
        <div className="summary-grid">
          {cards.map(([label, value]) => (
            <div className="summary-card" key={label}>
              <span>{label}</span>
              <strong title={value}>{value}</strong>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Initial commit input">
        <pre className="code-block">{entry.input?.commitMessage || "<empty>"}</pre>
      </Section>

      <Section title="Generated commit message">
        <div className="generated-panel">
          <pre className="generated-message">{generated || "<empty>"}</pre>
        </div>
      </Section>

      <Section title="Staged files">
        {files.length === 0 ? (
          <p className="muted">No staged files recorded.</p>
        ) : (
          <div className="file-list advanced">
            {files.map((file) => (
              <div className="file-row" key={`${file.status}-${file.path}`}>
                <span className={`file-status ${statusClass(file.status)}`}>
                  {statusLabel(file.status)}
                </span>
                <span className="file-path" title={file.path}>
                  {file.path}
                </span>
                <span className="file-stats">
                  {Number.isFinite(file.added) && Number.isFinite(file.deleted) ? (
                    <>
                      <span className="added">+{file.added}</span>
                      <span className="deleted">-{file.deleted}</span>
                    </>
                  ) : (
                    "-"
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {showRaw ? (
        <Section title="Raw response">
          <pre className="code-block">{rawResponse}</pre>
        </Section>
      ) : null}
    </div>
  );
}
