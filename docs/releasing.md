# GitHub releases

Pushing a version tag starts the **Release** GitHub Actions workflow. It checks
that the tag matches `package.json`, runs the project checks and VS Code
integration tests, packages the extension, and creates a GitHub Release with the
`.vsix` attached. It does not publish to the Visual Studio Marketplace; publish
that separately through the Marketplace publisher portal.

## Create a release

1. Update `version` in `package.json` and `CHANGELOG.md`.
2. Commit and push those changes to `main` using your own Git identity.
3. Create and push a matching `v` tag. For version `0.1.0`, run:

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

The workflow rejects tags that do not match `v<package.json version>`. It
creates a release if one does not exist; rerunning the workflow replaces the
VSIX asset on that release. GitHub's built-in token needs `contents: write` to
create the release and upload the package.
