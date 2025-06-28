#!/bin/bash

# Setup MinIO buckets for BookmarkAI development

echo "Setting up MinIO buckets..."

# MinIO configuration
MINIO_HOST=${MINIO_HOST:-localhost:9000}
MINIO_ACCESS_KEY=${MINIO_ACCESS_KEY:-minioadmin}
MINIO_SECRET_KEY=${MINIO_SECRET_KEY:-minioadmin}

# Install mc (MinIO Client) if not present
if ! command -v mc &> /dev/null; then
    echo "Installing MinIO Client..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install minio/stable/mc
    else
        wget https://dl.min.io/client/mc/release/linux-amd64/mc
        chmod +x mc
        sudo mv mc /usr/local/bin/
    fi
fi

# Configure MinIO client
echo "Configuring MinIO client..."
mc alias set local http://${MINIO_HOST} ${MINIO_ACCESS_KEY} ${MINIO_SECRET_KEY}

# Create buckets
echo "Creating buckets..."
mc mb local/bookmarkai-media-development --ignore-existing
mc mb local/bookmarkai-media --ignore-existing
mc mb local/bookmarkai-storyboards --ignore-existing

# Set bucket policies (public read for media files)
echo "Setting bucket policies..."
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": ["*"]
      },
      "Action": ["s3:GetObject"],
      "Resource": ["arn:aws:s3:::bookmarkai-media-development/temp/videos/*"]
    }
  ]
}
EOF

mc policy set-json /tmp/bucket-policy.json local/bookmarkai-media-development
rm /tmp/bucket-policy.json

# List buckets to verify
echo "Verifying buckets..."
mc ls local/

echo "MinIO setup complete!"
echo ""
echo "You can access MinIO console at: http://localhost:9001"
echo "Login with: minioadmin/minioadmin"