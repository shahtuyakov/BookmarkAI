const amqp = require('amqplib');

async function testLLMSummarization() {
  let connection;
  let channel;
  
  try {
    // Connect to RabbitMQ
    console.log('Connecting to RabbitMQ...');
    connection = await amqp.connect('amqp://ml:ml_password@localhost:5672/');
    channel = await connection.createConfirmChannel();
    
    // Declare the ml.summarize queue
    const queue = 'ml.summarize';
    await channel.assertQueue(queue, {
      durable: true,
      arguments: {
        'x-queue-type': 'quorum'
      }
    });
    
    // Create test message
    const testMessage = {
      share_id: `test-${Date.now()}`,
      content: {
        text: `Artificial Intelligence (AI) is transforming industries across the globe. 
        From healthcare to finance, AI technologies are enabling unprecedented levels of 
        automation and insight. Machine learning algorithms can now diagnose diseases, 
        predict market trends, and even create art. As we advance, ethical considerations 
        become increasingly important. We must ensure AI systems are transparent, fair, 
        and beneficial to all of humanity. The future of AI holds immense promise, but 
        it requires careful stewardship to realize its full potential while mitigating risks.`,
        title: 'The Impact of AI on Modern Society',
        content_type: 'article'
      },
      options: {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        style: 'brief',
        max_length: 150
      }
    };
    
    // Publish message
    console.log('Publishing test message to ml.summarize queue...');
    console.log('Message:', JSON.stringify(testMessage, null, 2));
    
    const published = await channel.publish(
      '',
      queue,
      Buffer.from(JSON.stringify(testMessage)),
      { 
        persistent: true,
        contentType: 'application/json'
      }
    );
    
    if (published) {
      console.log('✅ Test message sent successfully!');
      console.log('The LLM worker should process this and generate metrics.');
      console.log('\nCheck metrics at: http://localhost:9091/metrics');
      console.log('Look for:');
      console.log('  - ml_tasks_total');
      console.log('  - ml_cost_dollars_total');
      console.log('  - ml_tokens_processed_total');
      console.log('  - ml_model_latency_seconds');
    } else {
      console.error('❌ Failed to send message');
    }
    
    // Wait for confirmation
    await channel.waitForConfirms();
    console.log('Message confirmed by RabbitMQ');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

// Run the test
testLLMSummarization().catch(console.error);