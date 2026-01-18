import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Exclude api directory from Vite processing
  server: {
    watch: {
      ignored: ['**/api/**'],
    },
  },
})
