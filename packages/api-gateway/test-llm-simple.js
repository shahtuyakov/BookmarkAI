const amqp = require('amqplib');

async function sendTestMessage() {
  try {
    // Connect to RabbitMQ
    const connection = await amqp.connect('amqp://ml:ml_password@localhost:5672/');
    const channel = await connection.createChannel();
    
    // Create a simple test message
    const message = {
      id: 1,
      task: 'llm_service.tasks.summarize_content',
      args: [
        `test-share-${Date.now()}`, // share_id
        {
          text: 'This is a test article about artificial intelligence and its impact on society. AI is revolutionizing many industries.',
          title: 'Test Article',
          content_type: 'article'
        },
        {
          provider: 'openai',
          style: 'brief'
        }
      ],
      kwargs: {},
      retries: 0,
      eta: null,
      expires: null
    };
    
    // Send to ml.summarize queue
    const sent = channel.sendToQueue(
      'ml.summarize',
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    
    if (sent) {
      console.log('✅ Test message sent to ml.summarize queue');
      console.log('Check worker logs: docker logs -f bookmarkai-llm-worker');
      console.log('Check metrics: curl http://localhost:9091/metrics | grep "^ml_"');
    }
    
    await channel.close();
    await connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

sendTestMessage();