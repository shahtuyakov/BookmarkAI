/* eslint-env node */
module.exports = {
  '*.{js,jsx,ts,tsx}': ['eslint --fix', 'prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
  // Commented out until we have more Python files to check
  // 'python/**/*.py': ['pyright'],
};
