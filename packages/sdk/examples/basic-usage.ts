import { BookmarkAIClient, BrowserStorageAdapter } from '@bookmarkai/sdk';

async function main() {
  // Initialize the client
  const client = new BookmarkAIClient({
    baseUrl: 'https://api.bookmarkai.com',
    storage: new BrowserStorageAdapter(),
    environment: 'production',
  });

  try {
    // 1. Login
    console.log('Logging in...');
    const loginResponse = await client.auth.login({
      email: 'user@example.com',
      password: 'secure-password',
    });
    console.log('Logged in as:', loginResponse.user.email);

    // 2. Health check
    const isHealthy = await client.health.isHealthy();
    console.log('API healthy:', isHealthy);

    // 3. Create a share
    console.log('Creating share...');
    const share = await client.shares.create({
      url: 'https://www.tiktok.com/@user/video/123456',
      title: 'Awesome TikTok Video',
      notes: 'Must watch this later!',
    });
    console.log('Share created:', share.id);

    // 4. List shares
    const sharesList = await client.shares.list({
      limit: 10,
      status: 'done',
    });
    console.log(`Found ${sharesList.items.length} shares`);

    // 5. Batch create shares
    console.log('Creating multiple shares...');
    const urls = [
      'https://reddit.com/r/programming/comments/abc123',
      'https://twitter.com/user/status/987654321',
      'https://x.com/another/status/123456789',
    ];

    // These will be automatically batched
    const batchPromises = urls.map(url => 
      client.shares.create({ url })
    );
    const batchResults = await Promise.all(batchPromises);
    console.log(`Created ${batchResults.length} shares in batch`);

    // 6. Subscribe to events
    client.events.on('share-processed', (event) => {
      console.log('Share processed:', event.data);
    });

    client.events.on('cache-invalidation', (event) => {
      console.log('Cache invalidated for:', event.data.resource);
    });

    // Connect to SSE
    await client.events.connect();
    console.log('Connected to real-time events');

    // 7. Wait for a share to process
    const pendingShare = await client.shares.create({
      url: 'https://tiktok.com/@creator/video/999999',
    });
    
    console.log('Waiting for share to process...');
    const processedShare = await client.shares.waitForProcessing(
      pendingShare.id,
      { timeout: 30000 }
    );
    console.log('Share processed:', processedShare.status);

    // 8. Iterate through all shares
    console.log('Listing all shares...');
    let count = 0;
    for await (const share of client.shares.listAll()) {
      count++;
      if (count <= 5) {
        console.log(`- ${share.title || share.url}`);
      }
    }
    console.log(`Total shares: ${count}`);

  } catch (error: any) {
    console.error('Error:', error.message);
    
    // Handle specific error types
    if (error.code === 'AUTH_EXPIRED') {
      console.log('Token expired, please login again');
    } else if (error.code === 'RATE_LIMITED') {
      console.log(`Rate limited, retry after ${error.retryAfter} seconds`);
    }
  } finally {
    // Clean up
    client.destroy();
  }
}

// Development mode example
async function developmentExample() {
  const client = new BookmarkAIClient({
    baseUrl: 'http://localhost:3000',
    environment: 'development',
  });

  // Enable dev mode for ngrok URL updates
  client.enableDevMode({
    configUrl: '/.well-known/dev-config.json',
    pollInterval: 1000,
  });

  // Add custom interceptor for debugging
  client.addRequestInterceptor({
    onRequest: (config) => {
      console.log(`[DEBUG] ${config.method} ${config.url}`);
      return config;
    },
  });

  client.addResponseInterceptor({
    onResponse: (response) => {
      console.log(`[DEBUG] Response: ${response.status}`);
      return response;
    },
  });

  // Use the client...
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}