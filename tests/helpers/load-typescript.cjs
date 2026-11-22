const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "../..");

/** Load a complete production module with explicit browser/timer test doubles. */
function loadTypeScript(file, { globals = {}, modules = {} } = {}) {
  const filename = path.join(root, file);
  const source = fs.readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: filename,
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (Object.hasOwn(modules, name)) return modules[name];
      throw new Error(`Missing test dependency: ${name} in ${file}`);
    },
    ...globals,
  }, { filename });
  return exports;
}

module.exports = { loadTypeScript, root };
