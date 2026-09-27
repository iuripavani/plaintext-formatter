# Contributing

Plaintext Formatter should make native Format Document work reliably in unsaved Plain Text tabs. Correctness matters more than language count. Please read [AGENTS.md](AGENTS.md) and [the architecture notes](docs/architecture.md) before changing detection or routing.

Use Node.js 22.14+ and npm. Run `npm ci`, make a small focused change, then run:

```sh
npm run compile
npm run lint
npm test
npm run test:integration
npm run format
npm run format:check
npm run package
```

Press F5 to launch the extension development host. Run `npm run build` after edits or restart the debug session to rebuild. Integration tests use an isolated profile, not your normal installed extensions or settings.

Every detection change needs positive, malformed, ambiguous, and prose counterexamples. Include mixed-content and selection regressions when boundaries could change. Providers must not be trusted just because they return edits: validate syntax and preservation before applying. Tests must not execute pasted code or use real waiting for cooldown logic.

Prefer existing public VS Code APIs and small, maintained libraries over custom formatting engines. Justify dependencies with correctness, license, security, and bundle-size impact. Keep lockfiles current and review `npm audit` findings. Do not log document content, add telemetry, or use private editor APIs.

Describe the concrete behavior change and checks in pull requests. Use your own Git identity. Do not add artificial coauthor trailers. Report bugs with a minimized, non-sensitive snippet, expected/actual behavior, VS Code version, and installed formatter names.

For security reports, use GitHub's private vulnerability reporting if enabled. Do not post confidential document contents or exploitable private data in public issues.

See [the release guide](docs/releasing.md) for the GitHub Actions workflow and Marketplace publishing setup.
