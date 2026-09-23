import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
const externalRequire = createRequire(import.meta.url);
const cache = new Map();
export function loadTs(file) {
  const absolute = path.resolve(file);
  if (cache.has(absolute)) return cache.get(absolute).exports;
  const loadedModule = { exports: {} };
  cache.set(absolute, loadedModule);
  const compiled = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const resolve = (name) =>
    name.startsWith(".")
      ? name.endsWith(".json")
        ? JSON.parse(
            fs.readFileSync(path.resolve(path.dirname(absolute), name), "utf8"),
          )
        : loadTs(
            fs.existsSync(path.resolve(path.dirname(absolute), name + ".ts"))
              ? path.resolve(path.dirname(absolute), name + ".ts")
              : path.resolve(path.dirname(absolute), name, "index.ts"),
          )
      : externalRequire(name);
  new Function("exports", "module", "require", compiled)(
    loadedModule.exports,
    loadedModule,
    resolve,
  );
  return loadedModule.exports;
}
