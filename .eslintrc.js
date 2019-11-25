module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['standard', 'prettier'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'standard',
    // Prettier always last
    'prettier',
    'prettier/standard',
    'plugin:prettier/recommended',
    'prettier/@typescript-eslint',
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  rules: {},
}
