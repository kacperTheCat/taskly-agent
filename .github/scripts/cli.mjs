// Small helpers shared by the command-line scripts in this folder.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

// True when the module was started with `node <file>`, false when it was imported.
export function isMain(moduleUrl) {
  if (!process.argv[1]) return false;
  return moduleUrl === pathToFileURL(realpathSync(process.argv[1])).href;
}

// Parses `--name value` options and positionals. Exits 2 with the usage text when an option
// is unknown, a required option is missing, or there are fewer positionals than expected.
export function readArgs({ usage, options = {}, required = [], positionals = 0 }) {
  const fail = (message) => {
    console.error(`${message}\nUsage: ${usage}`);
    process.exit(2);
  };

  let parsed;
  try {
    parsed = parseArgs({ options, allowPositionals: true, strict: true });
  } catch (error) {
    fail(error.message);
  }
  for (const name of required) {
    if (parsed.values[name] === undefined) fail(`missing --${name}`);
  }
  if (parsed.positionals.length < positionals) fail(`expected ${positionals} argument(s)`);
  return { ...parsed.values, positionals: parsed.positionals };
}
