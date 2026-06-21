#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = join(repoRoot, "dist", "index.js");
const watchedDirs = [join(repoRoot, "src"), join(repoRoot, "config")];
const watchedFiles = [
  join(repoRoot, "package.json"),
  join(repoRoot, "package-lock.json"),
  join(repoRoot, "tsconfig.json")
];

function newestMtimeMs(paths) {
  let newest = 0;

  for (const path of paths) {
    if (!existsSync(path)) {
      continue;
    }

    const stat = statSync(path);

    if (stat.isDirectory()) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === "dist") {
          continue;
        }

        newest = Math.max(newest, newestMtimeMs([join(path, entry.name)]));
      }
      continue;
    }

    newest = Math.max(newest, stat.mtimeMs);
  }

  return newest;
}

function distIsStale() {
  if (!existsSync(distIndex)) {
    return true;
  }

  const distMtime = statSync(distIndex).mtimeMs;
  const sourceMtime = newestMtimeMs([...watchedDirs, ...watchedFiles]);

  return sourceMtime > distMtime;
}

function runBuild() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  process.stderr.write("[admcp] dist is missing or stale; running npm run build.\n");

  const result = spawnSync(npmCommand, ["run", "build"], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";

  if (stdout.length > 0) {
    process.stderr.write(stdout);
  }

  if (stderr.length > 0) {
    process.stderr.write(stderr);
  }

  if (result.error !== undefined) {
    process.stderr.write(`[admcp] build process failed: ${result.error.message}\n`);
  }

  if (result.status !== 0) {
    process.stderr.write(
      `[admcp] build failed; MCP server was not started. exit=${result.status ?? "unknown"}\n`
    );
    process.exit(result.status ?? 1);
  }
}

if (distIsStale()) {
  runBuild();
}

const child = spawn(process.execPath, [distIndex], {
  cwd: repoRoot,
  env: process.env,
  stdio: ["inherit", "inherit", "inherit"]
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.stderr.write(`[admcp] MCP server exited from ${signal}.\n`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});
