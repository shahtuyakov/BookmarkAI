const http = require('http');

// Configuration
const config = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/health',
  method: 'GET',
  timeout: 5000, // 5 second timeout
};

console.log(`Testing health endpoint: http://${config.hostname}:${config.port}${config.path}`);
console.log('Sending request...');

const req = http.request(config, (res) => {
  console.log(`\nResponse Status: ${res.statusCode} ${res.statusMessage}`);
  
  // Log headers for debugging
  console.log('\nHeaders:');
  console.log(JSON.stringify(res.headers, null, 2));
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      // Parse and pretty print JSON response
      const parsedData = JSON.parse(data);
      console.log('\nResponse Body:');
      console.log(JSON.stringify(parsedData, null, 2));
      
      // Additional analysis of response
      if (res.statusCode === 200 && parsedData.status === 'healthy') {
        console.log('\n✅ Health check passed: All systems operational');
      } else {
        console.log('\n⚠️ Health check warning: Some systems may be down');
        
        // Analyze which systems are down
        if (parsedData.checks) {
          Object.entries(parsedData.checks).forEach(([system, status]) => {
            if (status.status === 'down') {
              console.log(`❌ ${system} is down: ${status.error || 'No error details'}`);
            } else {
              console.log(`✅ ${system} is up (${status.responseTime})`);
            }
          });
        }
      }
    } catch (error) {
      console.error('\n❌ Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

// Handle request errors
req.on('error', (error) => {
  console.error('\n❌ Request failed:', error.message);
  if (error.code === 'ECONNREFUSED') {
    console.log('Make sure your API server is running on port 3001');
  }
});

// Set timeout
req.setTimeout(config.timeout, () => {
  req.destroy();
  console.error('\n❌ Request timed out after', config.timeout, 'ms');
});

req.end();