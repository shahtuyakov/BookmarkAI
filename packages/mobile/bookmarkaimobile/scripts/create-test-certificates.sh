#!/bin/bash

# Script to create test certificates for development
# These should NOT be used in production!

OUTPUT_DIR="./ios/Certificates"
mkdir -p "$OUTPUT_DIR"

echo "Creating test certificates for development..."

# Create a test private key
openssl genrsa -out "$OUTPUT_DIR/test-key.pem" 2048

# Create a test certificate
openssl req -new -x509 -key "$OUTPUT_DIR/test-key.pem" -out "$OUTPUT_DIR/test-cert.pem" -days 365 \
  -subj "/C=US/ST=State/L=City/O=BookmarkAI Test/CN=api.bookmarkai.com"

# Convert to DER format for iOS
openssl x509 -in "$OUTPUT_DIR/test-cert.pem" -outform DER -out "$OUTPUT_DIR/bookmarkai-prod.cer.test"
cp "$OUTPUT_DIR/bookmarkai-prod.cer.test" "$OUTPUT_DIR/bookmarkai-backup.cer.test"

# Clean up
rm -f "$OUTPUT_DIR/test-key.pem" "$OUTPUT_DIR/test-cert.pem"

echo "Test certificates created:"
echo "- $OUTPUT_DIR/bookmarkai-prod.cer.test"
echo "- $OUTPUT_DIR/bookmarkai-backup.cer.test"
echo ""
echo "To use for testing:"
echo "1. Rename .test files to .cer"
echo "2. Add to Xcode project"
echo "3. Remember to use real certificates for production!"