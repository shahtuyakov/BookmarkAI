#!/bin/bash

# Script to export SSL certificates for certificate pinning
# Usage: ./export-certificates.sh <domain>

DOMAIN=${1:-api.bookmarkai.com}
OUTPUT_DIR="./ios/Certificates"

echo "Exporting SSL certificates for domain: $DOMAIN"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

# Export the certificate chain
echo "Fetching certificate chain..."
openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" -showcerts < /dev/null 2>/dev/null | \
  awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/ {print}' > "$OUTPUT_DIR/cert-chain.pem"

# Split the chain into individual certificates
echo "Splitting certificate chain..."
csplit -f "$OUTPUT_DIR/cert-" -b "%02d.pem" "$OUTPUT_DIR/cert-chain.pem" '/-----BEGIN CERTIFICATE-----/' '{*}'

# Convert the main certificate to DER format
echo "Converting main certificate to DER format..."
if [ -f "$OUTPUT_DIR/cert-01.pem" ]; then
  openssl x509 -in "$OUTPUT_DIR/cert-01.pem" -outform DER -out "$OUTPUT_DIR/bookmarkai-prod.cer"
  echo "Created: $OUTPUT_DIR/bookmarkai-prod.cer"
fi

# Convert the intermediate certificate as backup (if exists)
if [ -f "$OUTPUT_DIR/cert-02.pem" ]; then
  openssl x509 -in "$OUTPUT_DIR/cert-02.pem" -outform DER -out "$OUTPUT_DIR/bookmarkai-backup.cer"
  echo "Created: $OUTPUT_DIR/bookmarkai-backup.cer"
fi

# Clean up temporary files
rm -f "$OUTPUT_DIR/cert-chain.pem" "$OUTPUT_DIR/cert-"*.pem

# Display certificate information
echo -e "\nCertificate Information:"
if [ -f "$OUTPUT_DIR/bookmarkai-prod.cer" ]; then
  echo -e "\nPrimary Certificate:"
  openssl x509 -in "$OUTPUT_DIR/bookmarkai-prod.cer" -inform DER -noout -subject -dates -fingerprint -sha256
fi

if [ -f "$OUTPUT_DIR/bookmarkai-backup.cer" ]; then
  echo -e "\nBackup Certificate:"
  openssl x509 -in "$OUTPUT_DIR/bookmarkai-backup.cer" -inform DER -noout -subject -dates -fingerprint -sha256
fi

echo -e "\nDone! Certificates exported to: $OUTPUT_DIR"
echo "Next steps:"
echo "1. Open Xcode"
echo "2. Drag the .cer files into your iOS project"
echo "3. Make sure 'Copy items if needed' is checked"
echo "4. Add to target: BookmarkAI"