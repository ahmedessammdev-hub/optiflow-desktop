import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
export default tseslint.config({ ignores: ['node_modules/**', 'dist/**', 'dist-electron/**', 'release/**'] }, eslint.configs.recommended, ...tseslint.configs.recommended, { rules: { '@typescript-eslint/no-explicit-any': 'error' } });
