import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // The render loop mutates typed arrays, materials, and shared per-frame
    // state inside useFrame by design — that is how a 60 fps WebGL scene
    // stays off the React render path. The React-Compiler-era immutability
    // rules assume idiomatic React and flag exactly this, so they are scoped
    // out of the scene layer (and the layout worker, which mutates sim nodes).
    files: ['src/scene/**', 'src/layout.ts', 'src/App.tsx', 'src/ui/TimelineBar.tsx'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
