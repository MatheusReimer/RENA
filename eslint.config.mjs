import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import vue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'

/**
 * Lint configuration.
 *
 * Deliberately small: TypeScript's own strict settings (see tsconfig.base.json)
 * already catch most of what a large rule set would, and a lint config that
 * argues with the compiler is noise. These rules cover what tsc cannot see.
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/dist/**',
      '**/migrations/**',
      '**/coverage/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],

  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  {
    rules: {
      // Nuxt auto-imports (ref, computed, useRuntimeConfig, navigateTo...) are
      // globals at build time and would otherwise all read as undefined.
      'no-undef': 'off',

      // An unused argument named with a leading underscore is intentional.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // `any` defeats the point of the shared types package (SPEC 29).
      '@typescript-eslint/no-explicit-any': 'error',

      // Non-null assertions are used deliberately after a RETURNING clause or
      // a unique-index insert, where the row is guaranteed. Flagging every one
      // would train people to ignore the rule.
      '@typescript-eslint/no-non-null-assertion': 'off',

      // Single-word component names are fine given the directory prefixes
      // Nuxt applies (UiAppButton, FeedActivityCard).
      'vue/multi-word-component-names': 'off',

      // Left to the formatter rather than the linter.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-indent': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/attributes-order': 'off',

      // v-html is the XSS vector for user-generated content (SPEC 39).
      'vue/no-v-html': 'error',

      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
    },
  },
)
