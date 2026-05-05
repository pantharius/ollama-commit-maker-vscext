import type { WebviewToExtensionMessage } from "./types";

interface VsCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

const fallbackApi: VsCodeApi = {
  postMessage(message) {
    console.log("[Ollama Commit Maker Webview] VS Code API unavailable", message);
  },
};

let api: VsCodeApi | null = null;

export function getVsCodeApi(): VsCodeApi {
  if (!api) {
    api = window.acquireVsCodeApi ? window.acquireVsCodeApi() : fallbackApi;
  }

  return api;
}

export function postMessage(message: WebviewToExtensionMessage): void {
  getVsCodeApi().postMessage(message);
}
