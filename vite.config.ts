import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Set VITE_BASE=/photography/ when serving from a route on the main site.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  server: {
    // Git Bash crash dumps land in the project root and force a full page reload if watched.
    watch: { ignored: ['**/*.stackdump', '**/image/**'] },
  },
})
