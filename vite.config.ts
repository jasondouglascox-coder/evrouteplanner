/// <reference types="vitest" />
import { defineConfig } from 'vite'

// For a GitHub Pages project site the app is served from /<repo>/, so the
// production build needs that base path; local dev/preview stays at root.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/evrouteplanner/' : '/',
  test: {
    globals: true,
    environment: 'node',
  },
}))
