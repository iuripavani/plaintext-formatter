# Architecture decisions

## Plan and boundaries

The repository began empty. Implement native plaintext document/range providers, a pure analysis core, independent region detection, provider-first routing, validated fallbacks for four guaranteed formats, and local milestone state. Verify through unit tests and an isolated real extension host; package a bundled VSIX.

`analysis` owns classification and shared offset-based types. `detection` owns confidence/evidence and parser adapters. `regions` identifies original-source spans and resolves overlaps. `formatting` owns backend results, edit reconstruction, routing and operation planning. `validation` owns output preservation. `state` owns clock-independent milestone transitions. `ui` and `extension.ts` adapt these components to public VS Code APIs.

UTF-16 offsets are used throughout the pure core and converted through `TextDocument.positionAt` at the API boundary. All edits refer to the same original text. A failed region does not invalidate unrelated successful regions; a changed document invalidates the entire pending transaction. Detection never rewrites language mode.

## Delegation

`workspace.openTextDocument({language, content})` and `vscode.executeFormatDocumentProvider` are the primary public delegation route. With no document edits, the router tries `vscode.executeFormatRangeProvider` over the full temporary document; native CSS needs this route. A `canFormat` preflight is deliberately absent: VS Code offers no provider availability API, so a preflight would repeat work or guess. Empty edits from both routes are treated as unavailable and may trigger a fallback. An explicit identical replacement is a validated no-op. Provider errors, timeouts, overlapping edits and invalid output may fall through to a safe fallback.

The source document is checked for cancellation, closure, and version changes before edits return. Native providers count validated returned edits, because VS Code supplies no apply acknowledgment. The block command uses `TextEditor.edit` for one undoable, version-checked batch and counts only accepted edits.

## Dependency decisions

No formatter ecosystem or Python runtime is bundled. Dependencies were inspected through npm metadata, documentation, lockfile, and audit during implementation:

| Dependency        | Why it exists                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `jsonc-parser`    | Token-preserving JSON fallback and JSONC parsing; avoids numeric rounding/key loss from stringify |
| `saxes`           | Strict XML structural validation without external entity loading                                  |
| `xml-formatter`   | XML layout fallback with mixed-content support                                                    |
| `yaml`            | YAML collection parsing, comment-aware serialization, bounded aliases                             |
| `node-sql-parser` | SQL grammar checks; only the PostgreSQL build is bundled                                          |
| `sql-formatter`   | Reliable SQL layout fallback; preserves keyword case                                              |
| `@babel/parser`   | JavaScript/TypeScript syntax and AST preservation without a formatter runtime                     |
| `postcss`         | CSS parsing and tree preservation without a formatter runtime                                     |

The SQL parser package has a large development install because it ships many grammar builds. The extension imports one build and esbuild excludes unused dialects. A more permissive grammar trial was rejected because it interpreted malformed SQL as assignments. The final MERGE adapter accepts only a bounded table-to-table form and validates its component clauses with the same strict grammar. It does not execute SQL.

`npm run build` generates a bundle metafile and third-party notices from bundled inputs. The VSIX allowlist includes only the runtime bundle, manifest, README, changelog, license and notices. Development dependencies, tests, source maps and the downloaded VS Code host are excluded.

## Conservative limits

Whole input must parse; a high-confidence subregion never makes the whole document a language. Primitives, scalar YAML, unstructured YAML lists, malformed JSON, DTDs, and unknown/mismatched fences are refused. Ambiguous flat all-string YAML mappings are intentionally not recognized. A complete selected snippet may still format even when the whole document is mixed.

XML does not have universal whitespace semantics without a schema. Preserve text and horizontal separators, reject `xml:space="preserve"` changes, and allow indentation-only newlines between element-only children. HTML support is intentionally restricted to XML-compatible markup. Python is a structural heuristic with conservative output guards, not a complete syntax parser.

Document size, candidate scan work, candidate count and delegation wait are bounded. Synchronous parsers cannot be preempted by VS Code cancellation; the size limit reduces exposure but is not a hard CPU deadline. XML external entities are unsupported; YAML alias expansion is bounded. Parser failures are safe no-ops.

## Milestone UX

A local serialized update queue prevents concurrent successful operations losing increments. Pure state transitions accept injected timestamps. Milestones occur at exact multiples of ten, subject to both two-day prompt and 30-day click cooldowns. Missed milestones are not replayed. Copy rotates by actual prompt count. Clicking records a click, not a verified star. A public native notification progress item reports detection, formatting, validation, and completion, with a short visible dwell at each distinct stage. An eligible star action is shown only after the progress item closes. VS Code's public API does not support adding an action to a progress item or pinning a second message beneath it, so this is the closest native sequential experience.

## Release checks

Run compile, lint, unit tests, extension-host tests, formatting checks, dependency audit and VSIX packaging. CI runs unit/package checks on Linux and Windows and integration tests on the minimum supported VS Code and stable. Publishing to Marketplace requires a configured publisher account and a separate release decision.
