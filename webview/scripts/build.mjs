import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const originalExec = childProcess.exec;
const webviewRoot = fileURLToPath(new URL("..", import.meta.url));
const workspaceRoot = path.resolve(webviewRoot, "..");

childProcess.exec = function patchedExec(command, ...args) {
  if (typeof command === "string" && command.trim().toLowerCase() === "net use") {
    const callback = args.find((arg) => typeof arg === "function");

    if (callback) {
      queueMicrotask(() => callback(null, "", ""));
    }

    return {
      on() {
        return this;
      },
      once() {
        return this;
      },
      kill() {},
    };
  }

  return originalExec.call(this, command, ...args);
};

function patchViteWindowsNetworkProbe() {
  const viteConfigChunk = path.join(
    workspaceRoot,
    "node_modules",
    "vite",
    "dist",
    "node",
    "chunks",
    "config.js"
  );

  if (!fs.existsSync(viteConfigChunk)) {
    return;
  }

  const source = fs.readFileSync(viteConfigChunk, "utf8");
  const probe = 'exec("net use", (error$1, stdout) => {';

  if (!source.includes(probe) || source.includes("return;\n\texec(\"net use\"")) {
    return;
  }

  fs.writeFileSync(
    viteConfigChunk,
    source.replace(probe, `return;\n\t${probe}`),
    "utf8"
  );
}

patchViteWindowsNetworkProbe();

const { build } = await import("vite");

await build({
  root: webviewRoot,
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
    sourcemap: false,
  },
});
