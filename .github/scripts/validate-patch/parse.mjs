// Parsers for the two forms a patch is inspected in: its text and the tree it produces.

// One entry per `diff --git` section: the paths and the markers git writes for special changes.
export function parsePatch(patch) {
  const sections = patch.split(/^(?=diff --git )/m).filter((section) => section.startsWith('diff --git '));
  return sections.map((section) => {
    const [, oldPath, newPath] = section.match(/^diff --git a\/(\S+) b\/(\S+)/) ?? [];
    return {
      oldPath,
      newPath,
      created: /^new file mode/m.test(section),
      deleted: /^deleted file mode/m.test(section),
      renamedOrCopied: /^(rename|copy) (from|to) /m.test(section),
      binary: /^(GIT binary patch|Binary files )/m.test(section),
      newMode: section.match(/^(?:new file mode|new mode) (\d+)/m)?.[1],
      oldMode: section.match(/^old mode (\d+)/m)?.[1],
    };
  });
}

// `git diff --raw -z` prints ":oldmode newmode oldsha newsha STATUS\0path\0" per file.
export function parseRawDiff(rawDiff) {
  const tokens = rawDiff.split('\0');
  const entries = [];
  for (let i = 0; i + 1 < tokens.length; i += 2) {
    const [, , newMode, , , status] = tokens[i].match(/^:(\d+) (\d+) (\w+) (\w+) ([A-Z])/) ?? [];
    entries.push({ path: tokens[i + 1], status, newMode });
  }
  return entries;
}
