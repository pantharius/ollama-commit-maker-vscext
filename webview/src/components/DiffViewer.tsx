import { useMemo, useState } from "react";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import { postMessage } from "../vscode";
import type { HistoryEntry } from "../types";

interface Props {
  entry: HistoryEntry;
}

type DiffMode = "unified" | "split";

function getDisplayDiff(entry: HistoryEntry): string {
  return entry.input?.diffFull || entry.input?.diffSent || "";
}

function hasFullDiff(entry: HistoryEntry): boolean {
  return Boolean(entry.input?.diffFull);
}

function getDiffType(type: string | undefined): "add" | "delete" | "modify" | "rename" | "copy" {
  if (type === "add" || type === "delete" || type === "rename" || type === "copy") {
    return type;
  }
  return "modify";
}

export function DiffViewer({ entry }: Props) {
  const [mode, setMode] = useState<DiffMode>(window.innerWidth >= 1200 ? "split" : "unified");
  const diffText = getDisplayDiff(entry);
  const files = useMemo(() => {
    if (!diffText.trim()) return [];

    try {
      return parseDiff(diffText, { nearbySequences: "zip" });
    } catch (error) {
      console.error("[Ollama Commit Maker Webview] Failed to parse diff", error);
      return [];
    }
  }, [diffText]);

  if (!diffText.trim()) {
    return (
      <section className="detail-section">
        <h2>Diff sent</h2>
        <p className="muted">No diff recorded.</p>
      </section>
    );
  }

  return (
    <section className="detail-section diff-section">
      <div className="section-heading">
        <div>
          <h2>Diff</h2>
          <p className={hasFullDiff(entry) ? "muted" : "warning-text"}>
            {hasFullDiff(entry)
              ? "Showing full staged diff."
              : "Full diff not available for this older trace. Showing sent diff."}
          </p>
        </div>
        <div className="section-actions">
          <button type="button" onClick={() => postMessage({ type: "copyDiff", id: entry.id })}>
            Copy diff
          </button>
          <button type="button" onClick={() => postMessage({ type: "openDiffInEditor", id: entry.id })}>
            Open native diff
          </button>
          <button
            type="button"
            className={mode === "unified" ? "active" : ""}
            onClick={() => setMode("unified")}
          >
            Unified
          </button>
          <button
            type="button"
            className={mode === "split" ? "active" : ""}
            onClick={() => setMode("split")}
          >
            Split
          </button>
        </div>
      </div>

      <div className="diff-meta">
        <span className="badge source">{entry.input?.diffSource || "-"}</span>
        <span className="badge neutral">full: {diffText.length} chars</span>
        <span className="badge neutral">sent: {entry.input?.diffSentLength || 0} chars</span>
        <span className="badge neutral">truncated: {entry.input?.diffWasTruncated ? "yes" : "no"}</span>
      </div>

      {files.length === 0 ? (
        <pre className="code-block">{diffText}</pre>
      ) : (
        <div className={`diff-viewer ${mode}`}>
          {files.map((file, index) => {
            const fileName = file.newPath || file.oldPath || `file-${index + 1}`;

            return (
              <article className="diff-file" key={`${fileName}-${index}`}>
                <header className="diff-file-header">
                  <strong>{fileName}</strong>
                  <span>{file.type || "modify"}</span>
                </header>
                <div className="diff-scroll">
                  <Diff
                    viewType={mode}
                    diffType={getDiffType(file.type)}
                    hunks={file.hunks}
                    gutterType="default"
                  >
                    {(hunks) =>
                      hunks.map((hunk) => (
                        <Hunk key={hunk.content} hunk={hunk} />
                      ))
                    }
                  </Diff>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
