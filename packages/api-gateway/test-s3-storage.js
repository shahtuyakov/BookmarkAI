#!/usr/bin/env node
/**
 * Test script for S3 storage integration with YtDlpService
 * Tests hybrid storage mode and S3 upload functionality
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

// Test configuration
const TEST_VIDEO_URL = 'https://www.tiktok.com/@loewhaley/video/7501788637290368311';

async function testS3Storage() {
  console.log('🚀 Testing S3 Storage Integration');
  console.log('================================\n');
  
  console.log('Configuration:');
  console.log(`- API URL: ${API_BASE_URL}`);
  console.log(`- Storage Mode: ${process.env.STORAGE_MODE || 'local'}`);
  console.log(`- S3 Bucket: ${process.env.S3_MEDIA_BUCKET || 'Not configured'}`);
  console.log(`- S3 Split %: ${process.env.S3_SPLIT_PERCENTAGE || '10'}%\n`);

  try {
    // Step 1: Create a share with video URL
    console.log('Step 1: Creating share with TikTok video...');
    const createResponse = await axios.post(
      `${API_BASE_URL}/api/v1/shares`,
      {
        url: TEST_VIDEO_URL,
        note: 'Testing S3 storage integration',
        tags: ['test', 's3-storage'],
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const shareId = createResponse.data.data.id;
    console.log(`✅ Share created: ${shareId}`);

    // Step 2: Wait for processing and check storage location
    console.log('\nStep 2: Waiting for video processing...');
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

    // Step 3: Get share details to see storage location
    console.log('\nStep 3: Checking share details...');
    const shareResponse = await axios.get(
      `${API_BASE_URL}/api/v1/shares/${shareId}`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
      }
    );

    const share = shareResponse.data.data;
    console.log('\nShare details:');
    console.log(`- Title: ${share.title}`);
    console.log(`- Platform: ${share.platform}`);
    console.log(`- Has Media: ${!!share.media}`);
    
    if (share.media?.url) {
      console.log(`\nMedia storage:');
      console.log(`- URL: ${share.media.url}`);
      console.log(`- Is S3: ${share.media.url.startsWith('s3://')}`);
      console.log(`- Is Local: ${share.media.url.startsWith('/')}`);
    }

    // Step 4: Get YtDlp metrics
    console.log('\nStep 4: Getting YtDlp service metrics...');
    const metricsResponse = await axios.get(
      `${API_BASE_URL}/api/v1/shares/metrics/ytdlp`,
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
        },
      }
    );

    const metrics = metricsResponse.data.data;
    console.log('\nYtDlp Metrics:');
    console.log(`- Total Requests: ${metrics.totalRequests}`);
    console.log(`- S3 Uploads: ${metrics.s3Uploads}`);
    console.log(`- S3 Upload Errors: ${metrics.s3UploadErrors}`);
    console.log(`- Local Storage: ${metrics.localStorage}`);
    console.log(`- S3 Upload Rate: ${metrics.s3UploadRate}`);
    console.log(`- Storage Mode: ${metrics.storageMode}`);
    console.log(`- S3 Configured: ${metrics.s3Configured}`);

    console.log('\n✅ S3 storage test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testS3Storage().catch(console.error);