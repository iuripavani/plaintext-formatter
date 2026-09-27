import { build } from "esbuild";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode"],
  mainFields: ["module", "main"],
  sourcemap: true,
  minify: true,
  legalComments: "inline",
  metafile: true,
}).then(async (result) => {
  await writeFile("dist/meta.json", JSON.stringify(result.metafile, null, 2));
  const packages = new Map();
  for (const input of Object.keys(result.metafile.inputs).filter((file) =>
    file.includes("node_modules/"),
  )) {
    let directory = path.dirname(path.resolve(input));
    while (directory !== path.dirname(directory)) {
      try {
        const manifest = JSON.parse(
          await readFile(path.join(directory, "package.json"), "utf8"),
        );
        if (manifest.name) {
          packages.set(manifest.name, { directory, manifest });
          break;
        }
      } catch {
        /* Find the owning package. */
      }
      directory = path.dirname(directory);
    }
  }
  let notices =
    "# Bundled third-party licenses\n\nGenerated from the runtime bundle inputs by `npm run build`.\n";
  for (const [name, { directory, manifest }] of [...packages].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const files = (await readdir(directory)).filter((file) =>
      /^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/i.test(file),
    );
    notices += `\n## ${name} ${manifest.version}\n\nLicense: ${manifest.license}\n`;
    if (!files.length) {
      // saxes 6 omits its license from npm; retain the upstream tag's license locally.
      const license = await readFile(`third-party/${name}-LICENSE`, "utf8");
      notices += `\n\`\`\`text\n${license.trim()}\n\`\`\`\n`;
    }
    for (const file of files)
      notices += `\n\`\`\`text\n${(await readFile(path.join(directory, file), "utf8")).trim()}\n\`\`\`\n`;
  }
  await writeFile("THIRD_PARTY_NOTICES.md", notices);
});
