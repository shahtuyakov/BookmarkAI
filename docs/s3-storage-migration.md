# S3 Storage Migration Guide

This guide documents the S3 storage implementation for video files in BookmarkAI, enabling cloud storage for better scalability and reliability.

## Overview

The S3 storage feature allows BookmarkAI to store downloaded videos in Amazon S3 instead of local filesystem, providing:
- **Scalability**: No local disk space limitations
- **Reliability**: AWS manages durability and availability
- **Cost efficiency**: Automatic lifecycle policies for cleanup
- **Performance**: Direct S3 access from ML workers

## Implementation Status

### ✅ Completed
1. **S3StorageService**: Complete S3 client implementation with upload/download capabilities
2. **YtDlpService Enhancement**: Integrated S3 uploads with hybrid storage mode
3. **Whisper Service**: Added S3 download support using boto3
4. **Configuration**: Environment variables and Docker compose updates
5. **Testing Infrastructure**: Test script for validation

### 🚧 Pending
1. CDK infrastructure deployment for Amazon MQ
2. Production S3 bucket configuration
3. CloudFront CDN setup for video delivery

## Architecture

### Storage Flow
```
TikTok URL → YtDlpService → Download Video → Storage Decision
                                                  ↓
                                    ┌─────────────┴─────────────┐
                                    │                           │
                              Local Storage                S3 Upload
                              (local mode)              (s3/hybrid mode)
                                    │                           │
                                    └─────────────┬─────────────┘
                                                  ↓
                                         Return Storage URL
                                    (local path or s3:// URL)
```

### Storage Modes
1. **Local Mode** (`STORAGE_MODE=local`): Traditional file system storage
2. **S3 Mode** (`STORAGE_MODE=s3`): All videos uploaded to S3
3. **Hybrid Mode** (`STORAGE_MODE=hybrid`): Percentage-based split for gradual migration

## Configuration

### Environment Variables

```bash
# AWS Configuration
AWS_REGION=us-east-1
S3_MEDIA_BUCKET=bookmarkai-media-prod-123456789

# Storage Configuration
STORAGE_MODE=hybrid        # Options: local, s3, hybrid
S3_SPLIT_PERCENTAGE=10     # Percentage for S3 in hybrid mode
S3_VIDEO_PREFIX=temp/videos/

# For API Gateway
YTDLP_DOWNLOAD_DIR=/tmp/bookmarkai-videos
```

### S3 Bucket Structure
```
s3://bookmarkai-media-{env}-{account}/
└── temp/
    └── videos/
        └── {year}/
            └── {month}/
                └── {day}/
                    └── {hash}_{timestamp}.{ext}
```

### IAM Permissions Required
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::bookmarkai-media-*/*"
    }
  ]
}
```

## Usage

### Testing S3 Storage

1. **Configure Environment**:
```bash
export STORAGE_MODE=hybrid
export S3_SPLIT_PERCENTAGE=100  # Force S3 for testing
export S3_MEDIA_BUCKET=your-bucket-name
export AWS_REGION=us-east-1
```

2. **Run Test Script**:
```bash
cd packages/api-gateway
./test-s3-storage.js
```

3. **Monitor Logs**:
```bash
# API Gateway logs
docker logs -f bookmarkai-api-gateway | grep -E "(S3|storage)"

# Whisper worker logs
docker logs -f bookmarkai-whisper-worker | grep -E "(S3|Downloading)"
```

### Verifying S3 Uploads

1. **Check Metrics**:
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/shares/metrics/ytdlp
```

2. **List S3 Objects**:
```bash
aws s3 ls s3://${S3_MEDIA_BUCKET}/temp/videos/ --recursive
```

3. **Verify Video Processing**:
- Create a share with a TikTok URL
- Check if `media.url` starts with `s3://`
- Verify Whisper worker can download and process

## Migration Strategy

### Phase 1: Testing (Week 1)
- Deploy with `STORAGE_MODE=hybrid` and `S3_SPLIT_PERCENTAGE=10`
- Monitor S3 upload success rate
- Verify ML workers can process S3 URLs
- Check cost metrics

### Phase 2: Gradual Rollout (Week 2-3)
- Increase S3 percentage: 10% → 25% → 50% → 75%
- Monitor performance metrics
- Adjust based on cost and latency

### Phase 3: Full Migration (Week 4)
- Switch to `STORAGE_MODE=s3`
- Remove local volume mounts
- Clean up old local files

## Rollback Plan

If issues occur, rollback is simple:
1. Set `STORAGE_MODE=local`
2. Restart API Gateway: `docker restart bookmarkai-api-gateway`
3. Videos will immediately use local storage

## Monitoring

### Key Metrics to Track
1. **S3 Upload Rate**: Percentage of successful S3 uploads
2. **Upload Latency**: Time to upload videos to S3
3. **Download Latency**: Time for workers to download from S3
4. **Storage Costs**: S3 storage and transfer costs
5. **Error Rate**: Failed uploads or downloads

### CloudWatch Alarms (Production)
- S3 upload failures > 5% in 5 minutes
- Average upload time > 30 seconds
- S3 access denied errors
- Budget alerts for S3 costs

## Troubleshooting

### Common Issues

1. **S3 Upload Fails**
   - Check AWS credentials: `aws sts get-caller-identity`
   - Verify bucket exists: `aws s3 ls s3://${S3_MEDIA_BUCKET}`
   - Check IAM permissions

2. **Whisper Can't Download**
   - Verify boto3 installed: `docker exec bookmarkai-whisper-worker pip show boto3`
   - Check S3 URL format in logs
   - Verify AWS credentials in container

3. **Performance Issues**
   - Check AWS region (use same region as compute)
   - Enable S3 Transfer Acceleration
   - Consider VPC endpoints for private connectivity

## Cost Optimization

1. **Lifecycle Policies**: Already configured for 7-day deletion in temp/
2. **Storage Classes**: Use S3 Standard for active content
3. **CloudFront CDN**: Reduce S3 transfer costs for popular videos
4. **VPC Endpoints**: Eliminate data transfer costs within AWS

## Security Considerations

1. **Encryption**: Enable S3 default encryption (AES-256)
2. **Access Control**: Use IAM roles, not access keys in production
3. **Bucket Policies**: Restrict access to specific prefixes
4. **Pre-signed URLs**: Generate time-limited URLs for downloads
5. **Audit Logging**: Enable S3 access logging

## Next Steps

1. **Production Deployment**:
   - Deploy S3 bucket via CDK
   - Configure IAM roles for ECS tasks
   - Set up CloudWatch monitoring

2. **Performance Optimization**:
   - Implement CloudFront CDN
   - Add S3 Transfer Acceleration
   - Configure VPC endpoints

3. **Advanced Features**:
   - Pre-signed URL generation for direct browser uploads
   - Multipart uploads for large videos
   - S3 event notifications for processing triggers