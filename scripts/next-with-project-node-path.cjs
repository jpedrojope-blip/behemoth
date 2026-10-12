const { spawn } = require("node:child_process");
const { delimiter, resolve } = require("node:path");
const Module = require("node:module");

const projectNodeModules = resolve(__dirname, "..", "node_modules");
const nodePaths = (process.env.NODE_PATH ?? "")
  .split(delimiter)
  .filter(Boolean)
  .map((entry) => resolve(entry));

if (!nodePaths.includes(projectNodeModules)) nodePaths.push(projectNodeModules);
process.env.NODE_PATH = nodePaths.join(delimiter);
Module._initPaths();

const nextCli = require.resolve("next/dist/bin/next");
const nextProcess = spawn(process.execPath, [nextCli, ...process.argv.slice(2)], {
  env: process.env,
  stdio: "inherit",
});

nextProcess.on("error", (error) => {
  console.error("Não foi possível iniciar o Next.js:", error);
  process.exitCode = 1;
});

nextProcess.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
