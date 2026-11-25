// Small helpers shared by the command-line scripts in this folder.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// True when the module was started with `node <file>`, false when it was imported.
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  return moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href;
}

// Parses `--name value` options and positionals, and exits with the usage text when a
// required option or the minimum number of positionals is missing.
export function readArgs({ usage, options = {}, required = [], positionals = 0 }) {
  try {
    const { values, positionals: given } = parseArgs({ options, allowPositionals: true, strict: true });
    const missing = required.filter((name) => values[name] === undefined);
    if (missing.length || given.length < positionals) throw new Error(`missing ${missing.join(', ') || 'arguments'}`);
    return { ...values, positionals: given };
  } catch (error) {
    console.error(`${error.message}\nUsage: ${usage}`);
    process.exit(2);
  }
}
