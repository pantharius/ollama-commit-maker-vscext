export type GenerationStatus = "success" | "error" | "unknown";
export type DiffSource = "git" | "rtk" | string;

export interface HistoryEntry {
  id?: string;
  createdAt?: string;
  repository?: {
    rootPath?: string | null;
    branch?: string | null;
    workspaceName?: string | null;
  };
  input?: {
    commitMessage?: string;
    stagedFilesRaw?: string;
    stagedFilesCount?: number;
    diffSource?: DiffSource | null;
    diffFull?: string;
    diffOriginalLength?: number;
    diffSentLength?: number;
    diffWasTruncated?: boolean;
    diffSent?: string;
  };
  prompt?: {
    system?: string;
    user?: string;
    full?: string;
  };
  ollama?: {
    url?: string;
    model?: string;
    options?: {
      temperature?: number;
    };
  };
  output?: {
    rawResponse?: string;
    cleanedCommitMessage?: string;
  };
  status?: {
    success?: boolean;
    error?: string | null;
    durationMs?: number;
  };
  steps?: HistoryStep[];
}

export interface HistoryStep {
  name?: string;
  label?: string;
  startedAt?: string;
  finishedAt?: string | null;
  success?: boolean | null;
  error?: string | null;
}

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "refreshHistory" }
  | { type: "copyGeneratedMessage"; id?: string }
  | { type: "copyPrompt"; id?: string }
  | { type: "copyDiff"; id?: string }
  | { type: "copyRawResponse"; id?: string }
  | { type: "openDiffInEditor"; id?: string };

export type ExtensionToWebviewMessage =
  | { type: "historyData"; entries: HistoryEntry[]; loadedAt?: string }
  | { type: "historyError"; error: string }
  | { type: "actionResult"; message?: string; error?: string };

export interface StagedFileItem {
  status: string;
  path: string;
  oldPath?: string;
  newPath?: string;
  added?: number;
  deleted?: number;
}
