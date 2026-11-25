// Lints the agent tooling (.github/scripts, .claude). The size limits keep every file a short,
// readable recipe; a file that outgrows them gets split, not exempted.
// ESLint itself is pinned in .github/lint. From the repo root:
//   npm ci --prefix .github/lint --ignore-scripts && .github/lint/node_modules/.bin/eslint .github/scripts .claude
const NODE_GLOBALS = { console: 'readonly', process: 'readonly', URL: 'readonly' };

export default [
  {
    files: ['.github/scripts/**/*.mjs', '.claude/**/*.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: NODE_GLOBALS },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'max-lines': ['error', { max: 100, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
      complexity: ['error', 8],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-len': ['error', { code: 130, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true }],
      'no-undef': 'error',
      'no-unused-vars': 'error',
      'no-shadow': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-nested-ternary': 'error',
    },
  },
  {
    // A test is a list of cases; long ones are fine as long as the file stays small.
    files: ['.github/scripts/**/*.test.mjs'],
    rules: { 'max-lines-per-function': 'off' },
  },
];
