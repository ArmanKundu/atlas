import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['out/**', 'release/**', 'dist/**', 'coverage/**', 'node_modules/**', 'build/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: [
      'src/main/**',
      'src/preload/**',
      'tests/**',
      '*.config.ts',
      '*.config.mts',
      '*.config.mjs',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    // Tooling scripts run in Node and pass callbacks into the app's page.
    files: ['scripts/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    // The file logger is the one place allowed to echo to the terminal in development.
    files: ['src/main/log.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', { allowConstantExport: true }],
      // The renderer never touches Node or Electron directly; everything goes through the bridge.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'electron', message: 'Use the typed bridge in src/renderer/lib/ipc.ts.' },
          ],
          patterns: [
            { group: ['node:*'], message: 'The renderer is sandboxed and has no Node access.' },
            { group: ['**/main/**'], message: 'Renderer code cannot import main-process code.' },
          ],
        },
      ],
    },
  },
  prettier,
)
