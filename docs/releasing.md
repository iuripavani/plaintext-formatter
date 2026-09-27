# Releasing

Marketplace releases are published by GitHub Actions when a GitHub Release is
published. The workflow validates the release tag, runs checks and VS Code
integration tests, packages the extension, attaches the `.vsix` to the GitHub
Release, and publishes the same package version to the Visual Studio Marketplace.
Marketplace publishing uses GitHub OIDC trusted publishing, so no long-lived
Marketplace token is stored in GitHub.

## One-time setup

1. Create or verify the Marketplace publisher whose ID matches `publisher` in
   `package.json` (`iuripavani`). Publisher IDs are permanent.
2. In the publisher's Marketplace management settings, add a trusted publishing
   policy for GitHub owner `iuripavani`, repository `plaintext-formatter`, and
   workflow `.github/workflows/release.yml`. The Marketplace policy must match
   the GitHub repository and publishing workflow exactly.
3. No GitHub Actions secret is required. The workflow requests a short-lived
   Marketplace credential through GitHub OIDC when publishing.

This uses `vsce publish --oidc`, which is supported by the repository's
`@vscode/vsce` dependency. Microsoft is retiring global Azure DevOps PATs on
December 1, 2026, so the workflow avoids depending on a long-lived PAT. See the
[VS Code publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
and [`vsce` trusted publishing documentation](https://github.com/microsoft/vscode-vsce#trusted-publishing).

## Publish a release

1. Update `version` in `package.json` and `CHANGELOG.md`.
2. Commit and push the release changes to `main` using your own Git identity.
3. Create a GitHub Release from that commit, using a tag exactly matching the
   package version with a `v` prefix (for example, `v0.1.0`).
4. Publish the GitHub Release. The **Release** workflow will run automatically.

The workflow rejects tags that do not match `v<package.json version>`. It
publishes the current package version and does not create or push commits or
tags. If validation or publishing fails, inspect the Actions run, fix the
cause, and rerun the failed job or publish a corrected version.

The workflow requires GitHub's built-in token to have `contents: write` so it
can attach the VSIX to the already-created GitHub Release. It also requests
`id-token: write` so `vsce` can exchange a GitHub OIDC token for a short-lived
Marketplace credential. No publisher token is available to the workflow.
