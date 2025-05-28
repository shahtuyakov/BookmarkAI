import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcManifest = join(__dirname, '..', 'src', 'manifest.json');
const distDir = join(__dirname, '..', 'dist');
const distManifest = join(distDir, 'manifest.json');

// Ensure dist directory exists
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}

// Copy manifest.json
copyFileSync(srcManifest, distManifest);
console.log('✅ manifest.json copied to dist/'); 