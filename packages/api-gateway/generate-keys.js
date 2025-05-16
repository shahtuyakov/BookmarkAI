const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Path to keys directory (inside api-gateway package)
const keysDir = path.join(__dirname, 'dev', 'keys');

// Ensure directory exists
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

// Generate RSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

// Write keys to files
fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);

console.log('RSA key pair generated for local development:');
console.log(`- Private key: ${path.join(keysDir, 'private.pem')}`);
console.log(`- Public key: ${path.join(keysDir, 'public.pem')}`);
console.log('\nThese keys are for local development only. In production, AWS KMS will be used.');