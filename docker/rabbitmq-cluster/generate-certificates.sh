#!/bin/bash
set -e

CERT_DIR="certificates"
mkdir -p "$CERT_DIR"

echo "Generating self-signed certificates for RabbitMQ TLS..."

# Generate CA private key
openssl genrsa -out "$CERT_DIR/ca_key.pem" 4096

# Generate CA certificate
openssl req -new -x509 -days 3650 -key "$CERT_DIR/ca_key.pem" -out "$CERT_DIR/ca_certificate.pem" \
  -subj "/C=US/ST=State/L=City/O=BookmarkAI/CN=BookmarkAI-CA"

# Generate server private key
openssl genrsa -out "$CERT_DIR/server_key.pem" 4096

# Generate server certificate request
openssl req -new -key "$CERT_DIR/server_key.pem" -out "$CERT_DIR/server.csr" \
  -subj "/C=US/ST=State/L=City/O=BookmarkAI/CN=rabbitmq-cluster"

# Create extensions file for SAN (Subject Alternative Names)
cat > "$CERT_DIR/extensions.cnf" <<EOF
[v3_req]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = rabbitmq-cluster
DNS.3 = rabbitmq1
DNS.4 = rabbitmq2
DNS.5 = rabbitmq3
DNS.6 = rabbitmq-node1
DNS.7 = rabbitmq-node2
DNS.8 = rabbitmq-node3
DNS.9 = rabbitmq-haproxy
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Sign server certificate with CA
openssl x509 -req -days 3650 -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca_certificate.pem" \
  -CAkey "$CERT_DIR/ca_key.pem" -CAcreateserial -out "$CERT_DIR/server_certificate.pem" \
  -extensions v3_req -extfile "$CERT_DIR/extensions.cnf"

# Generate client certificate (optional, for mutual TLS)
openssl genrsa -out "$CERT_DIR/client_key.pem" 4096
openssl req -new -key "$CERT_DIR/client_key.pem" -out "$CERT_DIR/client.csr" \
  -subj "/C=US/ST=State/L=City/O=BookmarkAI/CN=ml-client"
openssl x509 -req -days 3650 -in "$CERT_DIR/client.csr" -CA "$CERT_DIR/ca_certificate.pem" \
  -CAkey "$CERT_DIR/ca_key.pem" -CAcreateserial -out "$CERT_DIR/client_certificate.pem"

# Set appropriate permissions
chmod 644 "$CERT_DIR"/*.pem
chmod 600 "$CERT_DIR"/*_key.pem

# Clean up temporary files
rm -f "$CERT_DIR"/*.csr "$CERT_DIR"/*.srl "$CERT_DIR/extensions.cnf"

echo "Certificates generated successfully!"
echo ""
echo "Generated files:"
echo "- CA Certificate: $CERT_DIR/ca_certificate.pem"
echo "- Server Certificate: $CERT_DIR/server_certificate.pem"
echo "- Server Private Key: $CERT_DIR/server_key.pem"
echo "- Client Certificate: $CERT_DIR/client_certificate.pem (optional)"
echo "- Client Private Key: $CERT_DIR/client_key.pem (optional)"
echo ""
echo "To trust the CA certificate on your system:"
echo "- macOS: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain $CERT_DIR/ca_certificate.pem"
echo "- Ubuntu: sudo cp $CERT_DIR/ca_certificate.pem /usr/local/share/ca-certificates/bookmarkai-ca.crt && sudo update-ca-certificates"