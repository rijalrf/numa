// ESLint minimal: menangkap bug nyata dan menjaga aturan proyek (API tanpa console.*).
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/web/public/**', '.refira/**', 'scripts/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off', // sudah ditangani noUnusedLocals di tsc
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off', // dipakai untuk augmentasi tipe Express
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/lib/logger.ts', 'apps/api/prisma/**', '**/__tests__/**'],
    rules: { 'no-console': 'error' },
  },
);
