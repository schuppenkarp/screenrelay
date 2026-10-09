import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'releases/**',
      'backups/**',
      'public/vendor/**',
      'public/assets/**',
      'scripts/*.mjs',
    ],
  },
  {
    files: ['server/**/*.js', 'public/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true },
      ],
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
  { files: ['public/**/*.js'], languageOptions: { globals: { ...globals.browser } } },
  // These services evaluate callbacks inside the paired WhatsApp browser.
  {
    files: [
      'server/download-media.js',
      'server/groups.js',
      'server/recover-messages.js',
      'server/whatsapp-compat.js',
      'server/whatsapp.js',
    ],
    languageOptions: { globals: { window: 'readonly' } },
  },
  // Browser checks execute callbacks in Chromium as well as in Node.
  { files: ['scripts/test-*-browser.js'], languageOptions: { globals: { ...globals.browser } } },
];
