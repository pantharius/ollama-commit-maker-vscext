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
