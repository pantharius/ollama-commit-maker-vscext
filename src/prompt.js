"use strict";

function buildCommitPrompt({
  inputCommitMessage,
  stagedFilesRaw,
  diffSource,
  diffSent,
  includeEmoji,
}) {
  const emojiRule = includeEmoji
    ? "- Add one relevant emoji after the Conventional Commit prefix."
    : "- Do not use emoji.";
  const system = [
    "You are a senior developer generating precise Conventional Commit messages.",
    "",
    "Rules:",
    "- Return only the commit message.",
    "- Use Conventional Commit format.",
    "- Allowed types: feat, fix, refactor, perf, test, docs, chore, build, ci, style, revert.",
    "- Use a short imperative title.",
    "- Add a short body only if useful.",
    "- Do not invent changes.",
    "- Use the current commit input as user intent.",
    "- If the current input conflicts with the staged diff, prioritize the staged diff.",
    emojiRule,
  ].join("\n");

  const prompt = [
    "Current commit input:",
    inputCommitMessage || "<empty>",
    "",
    "Staged files:",
    stagedFilesRaw,
    "",
    "Diff source:",
    diffSource,
    "",
    "Staged diff:",
    diffSent,
    "",
    "Generate the commit message.",
  ].join("\n");

  return {
    system,
    prompt,
  };
}

module.exports = {
  buildCommitPrompt,
};
