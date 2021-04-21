module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  env: {
    node: true,
    mocha: true,
  },
  overrides: [
    {
      files: ['*.ts'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:import/typescript',
        'plugin:node/recommended',
        'plugin:promise/recommended',
        'standard',
        // Prettier always last
        'plugin:prettier/recommended',
      ],
      rules: {
        'no-undef': 'off',
        'no-redeclare': 'off',
        'node/no-missing-import': 'off',
        'node/no-unsupported-features/es-syntax': 'off',
        'no-empty': ['error', { allowEmptyCatch: true }],
      },
    }
  ],
}
