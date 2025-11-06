// .eslintrc.js
module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
        project: './tsconfig.json',
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
    ],
    env: {
        node: true,
        es2020: true,
    },
    rules: {
        '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-console': 'off',
        'no-undef': 'off', // TypeScript maneja esto
        'no-case-declarations': 'off',
        'no-redeclare': 'off',
        '@typescript-eslint/no-redeclare': 'error',
    },
    ignorePatterns: [
        'node_modules/',
        'dist/',
        '*.js',
        'types/global.d.ts'
    ],
};
