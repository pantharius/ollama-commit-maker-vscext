"use strict";

const { execFile } = require("child_process");

const RTK_MAX_BUFFER = 20 * 1024 * 1024;
const RTK_TIMEOUT_MS = 5000;

function getRtkEnv() {
  return {
    ...process.env,
    LC_ALL: "C.UTF-8",
  };
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        env: getRtkEnv(),
        maxBuffer: RTK_MAX_BUFFER,
        timeout: RTK_TIMEOUT_MS,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve(stdout);
      }
    );
  });
}

async function detectRtk(rtkCommand) {
  try {
    const stdout = await execFileAsync(rtkCommand, ["--version"]);

    return {
      available: true,
      command: rtkCommand,
      version: stdout.trim() || null,
    };
  } catch (error) {
    return {
      available: false,
      command: rtkCommand,
      error: error.message,
    };
  }
}

async function tryGetRtkDiff(rootPath, rtkCommand) {
  try {
    // RTK support is intentionally isolated and non-blocking. If this
    // conservative CLI shape fails, the caller must fall back to Git.
    const diff = await execFileAsync(rtkCommand, ["diff", "--staged"], {
      cwd: rootPath,
    });

    return diff.trim() ? diff : null;
  } catch (error) {
    console.log(
      `[Ollama Commit Maker] RTK diff failed, falling back to Git: ${error.message}`
    );
    return null;
  }
}

module.exports = {
  detectRtk,
  tryGetRtkDiff,
};
