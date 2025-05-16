import http from 'http';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/health',
  method: 'GET',
};

function logResponse(statusCode, data) {
  // Using function to contain logging logic
  process.stdout.write(`Status Code: ${statusCode}\n`);
  process.stdout.write(`Response Body: ${JSON.stringify(JSON.parse(data))}\n`);
}

function logError(message) {
  process.stderr.write(`Error: ${message}\n`);
}

const req = http.request(options, res => {
  let data = '';

  res.on('data', chunk => {
    data += chunk;
  });

  res.on('end', () => {
    logResponse(res.statusCode, data);
  });
});

req.on('error', error => {
  logError(error.message);
});

req.end();
