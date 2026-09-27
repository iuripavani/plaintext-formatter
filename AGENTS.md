# AGENTS.md

## Project identity

This repository contains **Plaintext Formatter**, an open-source VS Code extension.

The project exists to make this workflow work:

```text
Ctrl+N
Ctrl+V
Shift+Alt+F
Done
```

A user should be able to paste structured/code content into an unsaved Plain Text document and use VS Code's native **Format Document** command without manually selecting a language.

Plaintext Formatter is primarily:

> an intelligent language detector and formatter router.

It should delegate formatting to VS Code or installed formatting providers whenever possible rather than unnecessarily implementing its own formatter engines.

---

# Core product principles

When tradeoffs exist, use this order:

1. correctness
2. zero-friction UX
3. safety
4. native VS Code integration
5. conservative language detection
6. formatting quality
7. performance
8. maintainability
9. extensibility
10. GitHub-star conversion
11. feature breadth

The ideal reaction is:

> “This is exactly what I expected VS Code to do.”

---

# Primary workflow

The canonical workflow is:

```text
Untitled-1
Language Mode: Plain Text

Ctrl+V
↓
structured content
↓
Shift+Alt+F
↓
Plaintext Formatter detects language
↓
existing formatter is invoked
↓
validated formatted result replaces source
```

The normal user must not need to:

- save the file,
- manually select Language Mode,
- select all content,
- invoke a custom command,
- open another tab,
- use an external website,
- configure the extension before first use.

The primary interface is VS Code's native:

```text
Format Document
```

---

# Formatter routing

Plaintext Formatter should not become a collection of duplicate formatter implementations.

The preferred strategy is:

```text
detect language
      ↓
existing VS Code formatter/provider available?
      ↓
yes → delegate
      ↓
no
      ↓
reliable internal fallback available?
      ↓
yes → use fallback
      ↓
no
      ↓
leave document unchanged
```

Always prefer a reliable existing provider to duplicate logic.

---

# Virtual documents

When invoking formatters for a Plain Text document, prefer using an in-memory document whose language ID matches the detected language.

Conceptually:

```ts
const virtualDocument = await vscode.workspace.openTextDocument({
  language: detectedLanguageId,
  content: source
});
```

Then invoke the public VS Code formatting provider API/command.

Do not change the user's original `plaintext` document language merely to trigger another formatter unless no safe alternative exists.

Avoid using:

```ts
vscode.languages.setTextDocumentLanguage(...)
```

as the normal routing mechanism because it may trigger close/open events and interact with unrelated extensions.

The original document should remain a Plain Text document unless the user explicitly changes its language.

---

# Existing formatter providers

Support existing providers whenever available.

Examples include built-in or installed formatters for:

- JSON
- JSONC
- JavaScript
- TypeScript
- HTML
- CSS
- SCSS
- LESS
- Python
- additional languages installed in the user's environment

Plaintext Formatter should not ship its own Python formatter simply because Python can be detected.

If a user already has:

- Black,
- autopep8,
- Ruff,
- Prettier,
- another registered provider,

the routing layer should attempt to reuse it when compatible with public VS Code APIs.

---

# Guaranteed formats

The MVP must guarantee reliable detection and formatting for:

- JSON
- XML
- YAML
- SQL

These may use:

- VS Code providers,
- installed providers,
- internal fallback formatters.

Other languages may be supported opportunistically when:

1. detection is sufficiently confident, and
2. a formatter provider is available.

---

# Formatting architecture

Keep detection and formatting independent.

Conceptually:

```ts
interface DetectionResult {
  languageId: string;
  confidence: number;
  evidence?: DetectionEvidence[];
}
```

and:

```ts
interface FormattingBackend {
  canFormat(languageId: string): Promise<boolean>;

  format(
    text: string,
    languageId: string,
    options: vscode.FormattingOptions
  ): Promise<FormatResult>;
}
```

Possible implementations:

```text
VSCodeFormattingBackend
InternalFormattingBackend
```

The orchestration layer should not know implementation details of individual formatters.

---

# Detection philosophy

Detection correctness is more important than breadth.

Never optimize for:

> “detect something at all costs.”

Optimize for:

> “only modify the document when we have strong evidence.”

Formatting the wrong language is worse than returning no result.

Prefer false negatives over destructive false positives.

---

# Detection evidence

Prefer:

- parsing,
- syntax-aware checks,
- structural validation,
- multiple independent signals.

Regex may support detection but should rarely be the sole source of high confidence.

Every detector should be independently testable.

---

# JSON

Use actual JSON parsing.

Valid objects and arrays should generally receive near-certain confidence.

Do not classify:

```text
hello {world}
```

as JSON because braces are present.

Treat primitive JSON values more conservatively because they overlap with ordinary text.

---

# XML

Use a syntax-aware XML parser or equivalent structural validation.

Angle brackets alone are not sufficient.

Require coherent XML structure.

Be aware of XML/HTML overlap.

---

# YAML

YAML detection must be intentionally conservative.

This is critical.

Many ordinary plaintext values are technically valid YAML.

The following:

```text
hello world
```

must not become high-confidence YAML just because a YAML parser accepts it.

Require structural signals such as:

```yaml
name: John
items:
  - one
  - two
```

Use parser success plus structural evidence.

---

# SQL

Do not classify normal English as SQL based on keywords.

Require meaningful syntax combinations.

Support common structures such as:

- SELECT
- INSERT
- UPDATE
- DELETE
- MERGE
- WITH / CTE
- CREATE
- ALTER

For example:

```text
select the best option from the list
```

should not automatically become SQL.

---

# HTML

HTML may overlap with XML.

Use:

- known HTML tags,
- document structure,
- syntax evidence.

Do not assume every `<tag>` is HTML.

---

# JavaScript and TypeScript

Require meaningful syntax evidence.

Do not classify arbitrary JSON-like text as JavaScript if valid JSON is a stronger explanation.

Use formatter delegation whenever possible.

---

# Python

Python detection should remain conservative.

Python formatting should normally be delegated to an installed formatter provider.

Do not bundle a Python formatter solely to increase the supported-language count.

---

# Document analysis

A document must be classified as one of:

```ts
type DocumentAnalysis =
  | {
      kind: "single-language";
      languageId: string;
      confidence: number;
    }
  | {
      kind: "mixed";
      regions: DetectedRegion[];
    }
  | {
      kind: "plaintext";
    };
```

A region should conceptually contain:

```ts
interface DetectedRegion {
  range: vscode.Range;
  languageId: string;
  confidence: number;
  source: "fence" | "parser" | "heuristic";
}
```

---

# Single-language documents

If nearly the entire document is confidently identified as one language:

```json
{"a":1,"b":[1,2,3]}
```

the standard `Format Document` workflow should format it automatically.

Avoid unnecessary prompts when confidence is strong.

---

# Plaintext documents

Ordinary text such as:

```text
Meeting tomorrow at 10.
Remember to call John.
```

should result in:

```text
kind: plaintext
```

Do not modify the content.

---

# Mixed-content documents

Plain Text may contain prose and multiple code languages.

Example:

```text
The API returned:

{"name":"John","items":[1,2,3]}

Then I executed:

select id,name from users where active=1;
```

This is not a JSON document.

It is not a SQL document.

It is:

```text
kind: mixed
```

with independent detected regions.

Never force a mixed document into a single-language formatter simply because one region has high confidence.

---

# Region detection

Region detection should support high-confidence structures such as:

- Markdown fenced code blocks,
- JSON objects/arrays,
- XML root structures,
- HTML regions,
- SQL statements,
- YAML structures.

Explicit code fences are especially strong evidence.

Example:

````text
```json
{"name":"John"}
```
````

has better evidence than an unmarked heuristic block.

---

# Mixed-content safety

The normal `Format Document` command must remain conservative.

Default behavior:

```text
single-language + high confidence
→ format

mixed document
→ do not blindly rewrite entire document

ordinary plaintext
→ leave unchanged
```

Never apply whole-document formatting to mixed prose/code content unless explicitly designed and tested to preserve surrounding text.

---

# Format Detected Code Blocks

Provide a secondary command:

```text
Plaintext Formatter: Format Detected Code Blocks
```

This may format confidently detected code regions independently.

Surrounding natural language must remain byte-for-byte unchanged.

Before applying any edit:

- detect all regions,
- resolve overlaps,
- compute edits,
- validate each result.

Do not sequentially mutate the document while still relying on stale ranges.

Prefer one batch of non-overlapping edits against the original document.

If sequential replacement is required, process regions from bottom to top.

---

# Overlapping regions

Region detection may produce overlapping candidates.

Example:

```text
large JSON region
inside it another brace-based candidate
```

The region-analysis layer must resolve these conflicts before formatting.

Prefer:

1. explicit regions,
2. parser-confirmed regions,
3. higher confidence,
4. larger coherent structures,

over weaker nested heuristics.

Never produce overlapping `TextEdit`s.

---

# Format Selection

Support native range formatting when possible.

If the user selects:

```json
{"a":1,"b":2}
```

inside a larger plaintext document, analyze only that range.

The rest of the document must have no influence on detection unless necessary for parser correctness.

The standard conceptual behavior is:

```text
Format Document
→ analyze whole document

Format Selection
→ analyze selected text

Format Detected Code Blocks
→ analyze independent regions
```

This workflow is especially important for mixed-content documents.

---

# Formatting lifecycle

Treat formatting transactionally:

```text
source
  ↓
detect
  ↓
confidence check
  ↓
choose backend
  ↓
format
  ↓
validate
  ↓
construct edit
  ↓
apply
```

Never partially replace content before validation succeeds.

If any critical step fails:

- leave source untouched,
- provide discreet native feedback.

---

# Validation

Where possible, validate output using syntax-aware validation.

Examples:

```text
JSON → JSON.parse
XML → XML parser
YAML → YAML parser + structure
```

Do not accept output simply because a formatter returned it.

A formatter failure or invalid output must never destroy valid source content.

---

# Formatting feedback

Use native VS Code UX only.

Possible conceptual states:

```text
Detecting...
JSON detected
Formatting...
Validating...
JSON formatted
```

Do not artificially delay fast operations just to display progress.

The extension should feel instant for small pasted snippets.

Never manipulate VS Code's internal DOM.

Never use undocumented UI APIs.

---

# Successful-format counter

Persist local extension state:

```ts
successfulFormats
lastStarPromptAt
lastStarClickAt
```

A format is successful only if:

1. detection succeeds with sufficient confidence,
2. formatting succeeds,
3. output validation succeeds,
4. the resulting edit is successfully applied or returned.

Do not increment on:

- failed detection,
- unsupported language,
- formatter error,
- validation failure,
- rejected mixed-content operation.

For region formatting, default to counting one user command invocation as one successful format even if multiple blocks are formatted, unless there is a clearly documented reason to do otherwise.

---

# GitHub star goal

A major project goal is earning GitHub stars from satisfied users.

This goal must not compromise the product.

Do not show star prompts on every format operation.

---

# Star milestone

A CTA becomes eligible at every multiple of 10 successful formatting operations:

```text
10
20
30
40
50
...
```

The milestone should be visible in the message.

---

# Normal star-prompt cooldown

If a star CTA is shown and not clicked:

```text
2 days
```

must pass before another CTA may appear.

A user who formats 500 snippets in one afternoon must not see 50 prompts.

Milestone count and cooldown both apply.

---

# Clicked star-prompt cooldown

If the user clicks:

```text
★ Star on GitHub
```

apply:

```text
30 days
```

before another CTA can appear.

Do not assume a click means the user actually starred the repository.

Therefore:

- do not permanently suppress future prompts,
- do not retry quickly.

---

# Star CTA state

Persist at least:

```ts
successfulFormats
lastStarPromptAt
lastStarClickAt
```

Optionally track:

```ts
starPromptCount
```

if useful for UX decisions.

Do not send this state to external services.

---

# CTA wording

Messages should:

- acknowledge the milestone,
- remain short,
- explain why a GitHub star helps,
- avoid guilt,
- avoid aggressive engagement tactics.

Examples:

```text
10 successful formats 🎉
The easiest way to support Plaintext Formatter is to star the repository.
```

```text
20 successful formats 🎉
If Plaintext Formatter is saving you time, a GitHub star helps the project grow.
```

```text
30 successful formats 🎉
A star helps more developers discover Plaintext Formatter.
```

Action:

```text
★ Star on GitHub
```

Rotate the message between milestone appearances.

Do not animate or rotate wording while the UI is visible.

---

# CTA UX

The milestone CTA should, when possible, feel like part of the formatting-success experience rather than a completely separate advertisement.

Avoid:

```text
format success popup
immediately followed by
promotional popup
```

Use the closest native VS Code API behavior available.

If VS Code does not support an exact combined progress + action layout:

- use the cleanest native approximation,
- document the limitation,
- do not use DOM hacks.

---

# Marketplace acquisition

A major acquisition path is expected to be:

```text
user pastes code into plaintext
↓
Shift+Alt+F
↓
VS Code reports no formatter
↓
user chooses Find Formatter
↓
Category: Formatters plaintext
```

Marketplace metadata therefore matters.

Use:

```json
{
  "displayName": "Plaintext Formatter",
  "categories": ["Formatters"]
}
```

Relevant keywords include:

```text
plaintext
plain text
formatter
format
format document
json
jsonc
xml
yaml
sql
html
css
javascript
typescript
python
beautify
pretty print
auto detect
untitled
scratch
code formatter
```

Do not rename the product without a strong reason.

---

# README priorities

The README should lead with:

> # Paste. Format. Done.

Immediately show:

```text
Ctrl+N
Paste
Shift+Alt+F
Done
```

Explain early that Plaintext Formatter:

- detects the language automatically,
- delegates to VS Code and installed formatters when possible,
- works without saving,
- does not require changing Language Mode,
- supports Format Selection,
- can identify code inside mixed plaintext.

Do not lead with implementation details.

---

# Commands

Primary:

```text
Format Document
```

Secondary commands may include:

```text
Plaintext Formatter: Detect Language
Plaintext Formatter: Format As...
Plaintext Formatter: Format Detected Code Blocks
```

Also integrate with:

```text
Format Selection
```

through the appropriate VS Code range-formatting API.

No custom command should be necessary for the standard use case.

---

# Configuration

Settings should be minimal.

Potential valid settings:

```text
minimum confidence
enabled languages
mixed-content behavior
preferred backend behavior
language-specific options
```

Every setting must justify itself with a meaningful user need.

Defaults should be sufficient for most users.

---

# Dependencies

Keep dependency count low.

Before adding a dependency, evaluate:

1. maintenance status,
2. security,
3. transitive dependency count,
4. package size,
5. whether VS Code already provides the capability,
6. whether correctness would suffer without it.

Formatter libraries are appropriate for guaranteed fallback support where necessary.

Do not bundle large formatter ecosystems simply to claim broad language support.

---

# Safety

Treat pasted document content as hostile/untrusted input.

Never use:

```text
eval
Function(...)
shell execution
child processes triggered by content
generated scripts
arbitrary code execution
network-based language detection
network-based formatting
```

The core extension must work offline.

Never send source document contents outside VS Code.

---

# Telemetry

Core functionality must not require telemetry.

If telemetry is added later:

- never collect document content,
- respect VS Code telemetry preferences,
- document exactly what is collected,
- use minimal anonymous events.

Star CTA state must remain local.

---

# Performance

Most documents will be small scratch snippets.

Common operations should feel instantaneous.

Avoid:

- repeated parsing with identical parsers,
- unnecessary copies,
- artificial progress delays,
- expensive whole-document heuristic passes when simpler evidence already resolves detection.

For larger content, design detection so expensive analysis can short-circuit when possible.

---

# Testing priorities

False positives are especially important.

Every detector needs:

- positive examples,
- malformed examples,
- ambiguous examples,
- ordinary-text counterexamples.

---

# JSON tests

Include:

```text
objects
arrays
nested JSON
malformed JSON
primitive JSON
JSON/XML overlap
JSON embedded in prose
JSON-like JavaScript
```

---

# XML tests

Include:

```text
basic XML
attributes
namespaces
nested XML
malformed XML
HTML overlap
XML embedded in prose
```

---

# YAML tests

Include:

```text
mappings
sequences
nested YAML
multiline values
malformed YAML
ordinary prose accepted by YAML parser
JSON/YAML ambiguity
```

---

# SQL tests

Include:

```text
SELECT
INSERT
UPDATE
DELETE
MERGE
WITH / CTE
DDL
multiline SQL
plain English containing SQL keywords
SQL embedded inside prose
```

---

# Other-language tests

Add detection tests for:

```text
HTML
CSS
JavaScript
TypeScript
Python
```

with emphasis on false positives.

---

# Mixed-content tests

Test:

```text
prose + JSON
prose + SQL
prose + XML
JSON + SQL
multiple JSON blocks
multiple language blocks
Markdown fenced code
nested fences
adjacent regions
ambiguous regions
overlapping detection candidates
```

---

# Region formatting tests

Verify:

- surrounding prose remains exactly unchanged,
- region edits never overlap,
- length changes do not corrupt subsequent ranges,
- multiple regions format correctly,
- failure in one region has a defined safe behavior,
- original content is preserved on invalid formatter output.

---

# Selection-formatting tests

Verify:

- selected JSON formats,
- selected SQL formats,
- prose selection is left unchanged,
- surrounding text is untouched,
- mixed document does not affect independent selection detection.

---

# Formatter-router tests

Cover:

```text
VS Code provider available
provider unavailable
fallback available
no fallback
provider throws
provider produces invalid output
formatter returns no edits
formatter returns multiple edits
```

---

# CTA tests

Cover:

```text
formats 1–9 → no CTA
10 → CTA eligible
20 → CTA eligible if cooldown passed
ignored → 2-day cooldown
clicked → 30-day cooldown
100 formats in one session → no spam
new milestone after cooldown → eligible
click → one month passes → eligible again
```

Time-dependent logic must use injectable/mockable time.

Never rely on real waiting in tests.

---

# Code quality

Use:

- strict TypeScript,
- explicit types,
- small modules,
- clean separation of concerns,
- clear errors,
- descriptive names,
- dependency injection where it improves testing.

Avoid:

- `any`,
- giant orchestration files,
- hidden mutable globals,
- speculative inheritance,
- duplicated detection rules,
- hardcoded time math.

Use named constants:

```ts
const STAR_PROMPT_INTERVAL = 10;
const STAR_PROMPT_COOLDOWN_MS = ...
const STAR_CLICK_COOLDOWN_MS = ...
```

---

# Repository quality

Maintain:

```text
README.md
AGENTS.md
CONTRIBUTING.md
CHANGELOG.md
LICENSE
.gitignore
.vscodeignore
GitHub Actions
TypeScript configuration
ESLint
unit tests
VS Code integration tests
```

Ensure the extension packages successfully as a `.vsix`.

---

# Agent workflow

Before changing code:

1. inspect the repository,
2. inspect relevant tests,
3. understand existing detection and routing behavior.

Before implementing a meaningful feature:

1. identify whether VS Code already provides the capability,
2. avoid unnecessary reimplementation,
3. determine safety implications,
4. determine mixed-content implications.

Then:

1. implement the smallest coherent change,
2. add or update tests,
3. run TypeScript compilation,
4. run lint,
5. run unit tests,
6. run extension tests when relevant,
7. package when release-sensitive behavior changes.

Fix failures before finishing.

---

# Behavior changes

Any change involving:

- detection confidence,
- new language support,
- region detection,
- formatter routing,
- fallback formatting,
- mixed-content behavior,
- selection formatting,
- CTA frequency,
- cooldown behavior,

must include relevant tests.

Do not silently broaden detection rules without adding false-positive tests.

---

# Final principle

Plaintext Formatter should not try to understand everything.

It should understand enough to be **reliably useful**.

When uncertain:

> do less.

When confident:

> make formatting feel effortless.