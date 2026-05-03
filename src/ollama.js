"use strict";

const OLLAMA_TIMEOUT_MS = 60000;

function buildGenerateUrl(ollamaUrl) {
  if (!ollamaUrl || typeof ollamaUrl !== "string") {
    throw new Error("Ollama URL is not configured.");
  }

  let url;
  try {
    url = new URL(ollamaUrl);
  } catch {
    throw new Error(`Invalid Ollama URL: ${ollamaUrl}`);
  }

  const trimmedPath = url.pathname.replace(/\/+$/, "");
  url.pathname = trimmedPath.endsWith("/api")
    ? `${trimmedPath}/generate`
    : `${trimmedPath}/api/generate`;
  url.search = "";
  url.hash = "";

  return url.toString();
}

async function readJsonResponse(response) {
  const text = await response.text();

  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Ollama returned invalid JSON.");
  }
}

async function generateCommitMessageWithOllama({
  ollamaUrl,
  model,
  system,
  prompt,
}) {
  if (!model || typeof model !== "string") {
    throw new Error("Ollama model is not configured.");
  }

  const url = buildGenerateUrl(ollamaUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        system,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
        },
      }),
      signal: controller.signal,
    });

    const body = await readJsonResponse(response);

    if (!response.ok) {
      const detail = body.error || response.statusText || "Unknown Ollama error";
      throw new Error(`Ollama request failed (${response.status}): ${detail}`);
    }

    const message = cleanGeneratedCommitMessage(body.response || "");

    if (!message) {
      throw new Error("Ollama returned an empty commit message.");
    }

    return message;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Ollama request timed out.");
    }

    if (error instanceof TypeError) {
      throw new Error(`Ollama is not reachable: ${error.message}`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function cleanGeneratedCommitMessage(value) {
  let cleaned = String(value || "").trim();

  cleaned = cleaned
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  cleaned = cleaned
    .replace(/^here(?:'s| is) (?:the )?commit message:\s*/i, "")
    .replace(/^commit message:\s*/i, "")
    .replace(/^generated commit message:\s*/i, "")
    .trim();

  return cleaned;
}

module.exports = {
  generateCommitMessageWithOllama,
  cleanGeneratedCommitMessage,
};
