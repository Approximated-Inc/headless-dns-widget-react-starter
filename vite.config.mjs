import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const projectDir = fileURLToPath(new URL('.', import.meta.url));
export default {
  configFile: false,
  root: fileURLToPath(new URL('./src/', import.meta.url)),
  envDir: projectDir,
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { fs: { allow: [projectDir] } }
};
