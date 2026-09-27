# MVP verification

Verified on Windows with Node.js 24.19.0 on 2026-09-27.

| Check                                   | Result                                               |
| --------------------------------------- | ---------------------------------------------------- |
| Strict TypeScript compilation           | Passed                                               |
| ESLint                                  | Passed                                               |
| Prettier check                          | Passed                                               |
| Unit tests                              | 132 passed, zero failed or skipped                   |
| VS Code 1.95.3 extension host           | 21 checks passed                                     |
| VS Code 1.139.1 (stable) extension host | 21 checks passed                                     |
| `npm audit --omit=dev`                  | Zero vulnerabilities reported                        |
| VSIX packaging                          | Passed; bundled runtime and license notices included |

The real extension-host suite exercises unsaved JSON/XML/YAML/SQL, native Format Document and undo, range formatting, mixed/prose no-ops, one-batch region formatting and undo, Python provider delegation without opening tabs, multiple provider edits, invalid/throwing/empty providers, stale-source rejection, CRLF preservation, and actual built-in JavaScript/TypeScript/CSS/JSONC/HTML providers.

The intentional throwing-provider test produces an expected VS Code error log; the suite verifies that the source remains unchanged and exits successfully. The isolated hosts may print unrelated built-in extension warnings. No marketplace publication or real third-party Python formatter compatibility is claimed by these checks. Linux and Windows CI workflows are configured; their remote results are separate from these local results.

Notable issues caught and fixed before the initial commit:

- JSONC's UMD entry was not self-contained in the bundle; select the ESM entry.
- CSS provider activation can race a first request; await the known built-in extension and try the public full-range provider route.
- Temporary-document edit offsets must use the actual temporary document snapshot.
- Compare JSONC source token spans to preserve comments without treating neighboring layout whitespace as content.
- Preserve XML text separators and CSS tree nesting during output validation.

Run the commands in the README to reproduce the checks. Integration hosts and dependencies require downloads on the first run. The extension's own detection and fallback formatting require no network access.
