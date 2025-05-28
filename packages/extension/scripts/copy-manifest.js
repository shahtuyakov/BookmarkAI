// This script is no longer needed as Vite's publicDir feature handles copying manifest.json and other static assets.
// HTML files (popup.html, callback.html) are also in public/ and will be copied.
// The associated JS for these HTML files is handled as entry points in vite.config.js.

// console.log('ℹ️ scripts/copy-manifest.js is deprecated and can be removed.');

import { copyFileSync, existsSync, mkdirSync, renameSync, rmdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const distDir = join(__dirname, '..', 'dist');

// 1. Copy manifest.json
const srcManifest = join(__dirname, '..', 'src', 'manifest.json');
const distManifest = join(distDir, 'manifest.json');
if (!existsSync(distDir)) {
  mkdirSync(distDir, { recursive: true });
}
copyFileSync(srcManifest, distManifest);
console.log('✅ manifest.json copied to dist/');

// 2. Move HTML files if they are in dist/src/
const oldSrcDir = join(distDir, 'src');
const oldPopupPath = join(oldSrcDir, 'popup', 'popup.html');
const newPopupDir = join(distDir, 'popup');
const newPopupPath = join(newPopupDir, 'popup.html');

const oldCallbackPath = join(oldSrcDir, 'auth', 'callback.html');
const newCallbackDir = join(distDir, 'auth');
const newCallbackPath = join(newCallbackDir, 'callback.html');

function moveAndCleanup(oldPath, newDir, newPath) {
  if (existsSync(oldPath)) {
    if (!existsSync(newDir)) {
      mkdirSync(newDir, { recursive: true });
    }
    renameSync(oldPath, newPath);
    console.log(`✅ Moved ${oldPath} to ${newPath}`);

    const oldParentDir = dirname(oldPath);
    if (existsSync(oldParentDir) && readdirSync(oldParentDir).length === 0) {
      try {
        rmdirSync(oldParentDir);
        console.log(`🧹 Cleaned up empty directory: ${oldParentDir}`);
      } catch (e) {
        console.warn(`⚠️ Could not remove ${oldParentDir}: ${e.message}`);
      }
    }
  } else {
    // console.log(`ℹ️ Source HTML not found at ${oldPath}, assuming Vite placed it correctly or it wasn't built.`);
  }
}

try {
  moveAndCleanup(oldPopupPath, newPopupDir, newPopupPath);
  moveAndCleanup(oldCallbackPath, newCallbackDir, newCallbackPath);

  if (existsSync(oldSrcDir) && readdirSync(oldSrcDir).length === 0) {
    try {
      rmdirSync(oldSrcDir);
      console.log(`🧹 Cleaned up empty directory: ${oldSrcDir}`);
    } catch (e) {
      console.warn(`⚠️ Could not remove ${oldSrcDir}: ${e.message}`);
    }
  }
} catch (err) {
  console.error('❌ Error moving HTML files or cleaning up src directory:', err.message);
} 