import globals from 'globals';

export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-dupe-class-members': 'error',
      'no-redeclare': 'error',
      'no-const-assign': 'error',
      'no-unreachable': 'warn',
      'no-self-assign': 'error',
      'no-this-before-super': 'error',
      'no-use-before-define': ['error', { functions: false, classes: false, variables: false }],
      'getter-return': 'error',
      'no-func-assign': 'error',
      'no-import-assign': 'error'
    }
  }
];
