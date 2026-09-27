# Releasing

Marketplace releases are published by GitHub Actions when a version tag is
pushed. The workflow validates the tag, runs checks and VS Code integration
tests, packages the extension, creates a GitHub Release with the `.vsix` attached,
and publishes that package to the Visual Studio Marketplace.
Marketplace publishing uses GitHub OIDC trusted publishing, so no long-lived
Marketplace token is stored in GitHub.

## One-time setup

1. Create or verify the Marketplace publisher whose ID matches `publisher` in
   `package.json` (`iuripavani`). Publisher IDs are permanent.
2. In the publisher's Marketplace management settings, add a trusted publishing
   policy for GitHub owner `iuripavani`, repository `plaintext-formatter`, and
   workflow `.github/workflows/release.yml`. The policy must match the GitHub
   repository and publishing workflow exactly; the workflow itself only runs
   for `v*` tags.
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
3. Create and push a tag exactly matching the package version with a `v` prefix
   (for example, `v0.1.0`):

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

   The **Release** workflow will run automatically and create the GitHub Release
   for that tag.

The workflow rejects tags that do not match `v<package.json version>`. It does
not create or push source commits or tags. If validation or publishing fails,
inspect the Actions run, fix the cause, and rerun the failed job or publish a
corrected version. Reruns update the VSIX attached to an existing GitHub
Release, and Marketplace publishing skips an already-published version.

The workflow requires GitHub's built-in token to have `contents: write` so it
can create the GitHub Release and attach the VSIX. It also requests
`id-token: write` so `vsce` can exchange a GitHub OIDC token for a short-lived
Marketplace credential. No publisher token is available to the workflow.
