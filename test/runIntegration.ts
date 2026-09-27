import * as path from "node:path";
import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
  // Some editor-hosted terminals inherit this; Electron must launch as VS Code.
  delete process.env.ELECTRON_RUN_AS_NODE;
  await runTests({
    version: process.env.VSCODE_TEST_VERSION ?? "stable",
    vscodeExecutablePath: process.env.VSCODE_EXECUTABLE_PATH,
    extensionDevelopmentPath: path.resolve(__dirname, "../.."),
    extensionTestsPath: path.resolve(__dirname, "integration/suite.js"),
    launchArgs: [
      "--disable-extensions",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-workspace-trust",
      "--disable-gpu",
      "--no-sandbox",
    ],
  });
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
