import { useEffect, useMemo, useState } from "react";
import { HistoryList } from "./components/HistoryList";
import { TraceDetail } from "./components/TraceDetail";
import { postMessage } from "./vscode";
import type { ExtensionToWebviewMessage, HistoryEntry } from "./types";

type StatusFilter = "all" | "success" | "error";
type SourceFilter = "all" | "git" | "rtk";

function getStatus(entry: HistoryEntry): "success" | "error" | "unknown" {
  if (entry.status?.success === true) return "success";
  if (entry.status?.success === false) return "error";
  return "unknown";
}

function getSearchText(entry: HistoryEntry): string {
  return [
    entry.input?.commitMessage,
    entry.output?.cleanedCommitMessage,
    entry.input?.stagedFilesRaw,
    entry.ollama?.model,
    entry.repository?.rootPath,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

export function App() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;

      if (message.type === "historyData") {
        const nextEntries = Array.isArray(message.entries) ? message.entries : [];
        setEntries(nextEntries);
        setLoadedAt(message.loadedAt || new Date().toISOString());
        setError(null);
        setSelectedId((currentId) => {
          if (!currentId) return null;
          return nextEntries.some((entry) => entry.id === currentId) ? currentId : null;
        });
        return;
      }

      if (message.type === "historyError") {
        setError(message.error || "Unable to refresh history.");
      }
    };

    window.addEventListener("message", listener);
    postMessage({ type: "ready" });

    return () => window.removeEventListener("message", listener);
  }, []);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesSearch = !normalizedSearch || getSearchText(entry).includes(normalizedSearch);
      const matchesStatus = statusFilter === "all" || getStatus(entry) === statusFilter;
      const source = entry.input?.diffSource || "";
      const matchesSource = sourceFilter === "all" || source === sourceFilter;

      return matchesSearch && matchesStatus && matchesSource;
    });
  }, [entries, search, sourceFilter, statusFilter]);

  const selectedEntry = selectedId
    ? entries.find((entry) => entry.id === selectedId) || null
    : null;

  if (selectedEntry) {
    return (
      <TraceDetail
        entry={selectedEntry}
        onBack={() => setSelectedId(null)}
        onRefresh={() => postMessage({ type: "refreshHistory" })}
      />
    );
  }

  return (
    <HistoryList
      entries={entries}
      filteredEntries={filteredEntries}
      search={search}
      statusFilter={statusFilter}
      sourceFilter={sourceFilter}
      loadedAt={loadedAt}
      error={error}
      onSearchChange={setSearch}
      onStatusFilterChange={setStatusFilter}
      onSourceFilterChange={setSourceFilter}
      onRefresh={() => postMessage({ type: "refreshHistory" })}
      onOpen={(entry) => entry.id && setSelectedId(entry.id)}
    />
  );
}
