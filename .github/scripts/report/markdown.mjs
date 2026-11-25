// Markdown helpers for the PR comment. Everything the agent or a test run produced is
// untrusted, so it goes through text(), code() or number() before it is shown.
const ZERO_WIDTH_SPACE = '​';

// One line, length-capped, Markdown escaped, no @mentions and no autolinks.
export function text(value, max = 200) {
  const oneLine = String(value ?? '').replace(/\s+/g, ' ').trim();
  const capped = oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
  return capped
    .replace(/[\\`*_[\]<>|#~]/g, (char) => `\\${char}`)
    .replace(/@/g, `@${ZERO_WIDTH_SPACE}`)
    .replace(/:\/\//g, `:/${ZERO_WIDTH_SPACE}/`)
    .replace(/\bwww\./gi, `www${ZERO_WIDTH_SPACE}.`);
}

// Inline code cannot be escaped, so characters that would end it or split a table row are dropped.
export function code(value) {
  return `\`${String(value).replace(/[`|\r\n]/g, '')}\``;
}

export function number(value, digits = 0) {
  return Number.isFinite(value) ? value.toFixed(digits) : '?';
}

export function percent(value) {
  return Number.isFinite(value) ? `${value}%` : 'n/a';
}
