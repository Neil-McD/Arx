import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Serve PDF.js fonts/character maps/decoders locally, only when a document needs them. */
export function pdfAssetsPlugin(): Plugin {
  const packageRoot = new URL("./node_modules/pdfjs-dist/", import.meta.url);
  const { version } = JSON.parse(readFileSync(new URL("package.json", packageRoot), "utf8"));
  const files = new Map<string, string>();
  for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
    const folder = new URL(`${directory}/`, packageRoot);
    for (const file of readdirSync(folder, { withFileTypes: true })) {
      if (file.isFile()) files.set(`pdfjs/${version}/${directory}/${file.name}`, fileURLToPath(new URL(file.name, folder)));
    }
  }
  return {
    name: "polynet-pdf-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? "").split("?")[0]!.replace(/^\//, "");
        const file = files.get(path);
        if (!file) return next();
        res.setHeader("Content-Type", path.endsWith(".wasm") ? "application/wasm" : path.endsWith(".js") ? "text/javascript" : "application/octet-stream");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [fileName, file] of files) this.emitFile({ type: "asset", fileName, source: readFileSync(file) });
    },
  };
}
