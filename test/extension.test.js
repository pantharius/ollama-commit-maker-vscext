const assert = require("assert");
const vscode = require("vscode");

suite("Ollama Commit Maker Extension", () => {
  test("Extension module should be present", () => {
    const extension = require("../extension");

    assert.ok(extension, "Extension module should load");
    assert.strictEqual(typeof extension.activate, "function");
    assert.strictEqual(typeof extension.deactivate, "function");
  });

  test("Git helper module should expose expected functions", () => {
    const git = require("../src/git");

    assert.strictEqual(typeof git.getGitApi, "function");
    assert.strictEqual(typeof git.getRepository, "function");
    assert.strictEqual(typeof git.getCommitInput, "function");
    assert.strictEqual(typeof git.setCommitInput, "function");
    assert.strictEqual(typeof git.getRepositoryRoot, "function");
    assert.strictEqual(typeof git.getStagedFiles, "function");
    assert.strictEqual(typeof git.getStagedDiff, "function");
  });

  test("RTK helper module should expose expected functions", () => {
    const rtk = require("../src/rtk");

    assert.strictEqual(typeof rtk.detectRtk, "function");
    assert.strictEqual(typeof rtk.tryGetRtkDiff, "function");
  });

  test("Prompt helper should build emoji and non-emoji prompts", () => {
    const { buildCommitPrompt } = require("../src/prompt");

    const withEmoji = buildCommitPrompt({
      inputCommitMessage: "",
      stagedFilesRaw: "M\tREADME.md",
      diffSource: "git",
      diffSent: "diff --git a/README.md b/README.md",
      includeEmoji: true,
    });
    const withoutEmoji = buildCommitPrompt({
      inputCommitMessage: "",
      stagedFilesRaw: "M\tREADME.md",
      diffSource: "git",
      diffSent: "diff --git a/README.md b/README.md",
      includeEmoji: false,
    });

    assert.ok(withEmoji.system.includes("Add one relevant emoji"));
    assert.ok(withoutEmoji.system.includes("Do not use emoji"));
    assert.ok(withEmoji.prompt.includes("Current commit input:"));
    assert.ok(withEmoji.prompt.includes("Staged diff:"));
  });

  test("Ollama helper module should expose expected functions", () => {
    const ollama = require("../src/ollama");

    assert.strictEqual(typeof ollama.generateCommitMessageWithOllama, "function");
    assert.strictEqual(typeof ollama.cleanGeneratedCommitMessage, "function");
  });

  test("Ollama helper should clean generated commit messages", () => {
    const { cleanGeneratedCommitMessage } = require("../src/ollama");

    assert.strictEqual(
      cleanGeneratedCommitMessage("fix: update login"),
      "fix: update login"
    );
    assert.strictEqual(
      cleanGeneratedCommitMessage("```text\nfeat: add history\n```"),
      "feat: add history"
    );
    assert.strictEqual(
      cleanGeneratedCommitMessage("Here is the commit message: docs: update readme"),
      "docs: update readme"
    );
  });

  test("Commands should be registered", async () => {
    const commands = await vscode.commands.getCommands(true);

    assert.ok(
      commands.includes("ollamaCommitMaker.generateCommitMessage"),
      "generate command should be registered"
    );
    assert.ok(
      commands.includes("ollamaCommitMaker.openHistory"),
      "history command should be registered"
    );
  });
});
