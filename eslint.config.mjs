import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'

import path from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'
import pluginJs from '@eslint/js'

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({ baseDirectory: __dirname, recommendedConfig: pluginJs.configs.recommended })

export default [
  {
    languageOptions: { globals: globals.node },
    rules: {
      camelcase: 'off' // 完全禁用 camelcase 規則
    // 如果需要，只針對特定情況放寬規則
    // camelcase: ['error', { properties: 'never' }] // 禁止檢查物件屬性
    }
  },
  ...compat.extends('standard'),
  ...pluginVue.configs['flat/essential']
]
