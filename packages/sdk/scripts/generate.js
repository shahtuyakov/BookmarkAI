#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const OPENAPI_PATH = path.join(__dirname, '../../../apps/api/openapi.yaml');
const OUTPUT_DIR = path.join(__dirname, '../src/generated');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('🚀 Generating SDK from OpenAPI spec...');
console.log(`📄 Input: ${OPENAPI_PATH}`);
console.log(`📁 Output: ${OUTPUT_DIR}`);

const command = `npx openapi-typescript-codegen \
  --input "${OPENAPI_PATH}" \
  --output "${OUTPUT_DIR}" \
  --client axios \
  --name BookmarkAIClient \
  --useOptions \
  --useUnionTypes`;

exec(command, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Generation failed:', error.message);
    console.error(stderr);
    process.exit(1);
  }

  console.log(stdout);
  console.log('✅ SDK generated successfully!');

  // Create index file that exports everything
  const indexContent = `// Auto-generated SDK exports
export * from './generated';
export { BookmarkAIClient as default } from './generated';
`;

  fs.writeFileSync(
    path.join(__dirname, '../src/index.ts'),
    indexContent,
    'utf-8'
  );

  console.log('✅ Index file created');
});