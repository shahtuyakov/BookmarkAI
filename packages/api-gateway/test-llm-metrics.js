/**
 * Test script to generate LLM metrics for Prometheus
 * This sends a properly formatted Celery task to the ml.summarize queue
 */

const amqp = require('amqplib');
const { v4: uuidv4 } = require('uuid');

async function testLLMMetrics() {
  let connection;
  let channel;
  
  try {
    // Connect to RabbitMQ
    console.log('Connecting to RabbitMQ...');
    connection = await amqp.connect('amqp://ml:ml_password@localhost:5672/');
    channel = await connection.createConfirmChannel();
    
    // Don't re-declare the queue - it already exists with different parameters
    // Just check it exists
    try {
      await channel.checkQueue('ml.summarize');
      console.log('Queue ml.summarize exists');
    } catch (error) {
      console.error('Queue ml.summarize does not exist:', error.message);
      throw error;
    }
    
    // Create test share ID and content (must be a valid UUID)
    const shareId = uuidv4();
    const testContent = {
      text: `Artificial Intelligence (AI) is revolutionizing how we interact with technology and reshaping the modern world. 
             Machine learning algorithms can now understand natural language, recognize images with superhuman accuracy, 
             and even generate creative content that rivals human creativity. This technological advancement is transforming 
             industries from healthcare to finance, enabling automation and insights that were previously impossible.
             
             In healthcare, AI systems are diagnosing diseases earlier and more accurately than ever before. Machine learning 
             models can detect cancers in medical imaging that human doctors might miss, predict patient outcomes, and even 
             suggest personalized treatment plans based on vast amounts of medical data. The pharmaceutical industry is using 
             AI to accelerate drug discovery, potentially saving years of research and billions of dollars.
             
             The financial sector has embraced AI for fraud detection, risk assessment, and algorithmic trading. Banks use 
             sophisticated models to analyze transaction patterns and identify suspicious activities in real-time. Investment 
             firms leverage AI to make split-second trading decisions based on market signals that would be impossible for 
             humans to process quickly enough.
             
             As AI continues to evolve at a breakneck pace, it's crucial to consider both its immense potential and the 
             ethical implications of its widespread adoption. Questions about privacy, job displacement, algorithmic bias, 
             and the concentration of power in the hands of a few tech giants are becoming increasingly urgent. We must 
             ensure that AI development is guided by principles that benefit all of humanity, not just a privileged few.`,
      title: 'The AI Revolution: Transforming Our World',
      content_type: 'article'
    };
    
    // Create Celery-formatted message
    const celeryMessage = {
      id: uuidv4(),
      task: 'llm_service.tasks.summarize_content',
      args: [
        shareId,
        testContent,
        {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          style: 'brief',
          max_length: 150
        }
      ],
      kwargs: {},
      retries: 0,
      eta: null,
      expires: null,
      priority: null,
      headers: {
        lang: 'py',
        task: 'llm_service.tasks.summarize_content',
        id: uuidv4(),
        shadow: null,
        eta: null,
        expires: null,
        group: null,
        group_index: null,
        retries: 0,
        root_id: uuidv4(),
        parent_id: null,
        origin: 'nodejs-test'
      }
    };
    
    // Publish to queue
    console.log('Publishing test message to ml.summarize queue...');
    console.log(`Share ID: ${shareId}`);
    console.log(`Content: ${testContent.text.substring(0, 100)}...`);
    
    const published = await channel.publish(
      '', // default exchange
      'ml.summarize', // routing key (queue name)
      Buffer.from(JSON.stringify(celeryMessage)),
      {
        persistent: true,
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        headers: {
          'x-celery-task': 'llm_service.tasks.summarize_content'
        }
      }
    );
    
    await channel.waitForConfirms();
    
    console.log('✅ Message sent successfully!');
    console.log('\nTo check metrics:');
    console.log('1. Wait a few seconds for processing');
    console.log('2. Run: curl http://localhost:9091/metrics | grep "^ml_"');
    console.log('\nExpected metrics:');
    console.log('  - ml_tasks_total{status="success",worker_type="llm"}');
    console.log('  - ml_cost_dollars_total{task_type="summarization"}');
    console.log('  - ml_tokens_processed_total{token_type="input/output"}');
    console.log('  - ml_model_latency_seconds');
    console.log('\nCheck worker logs:');
    console.log('  docker logs -f bookmarkai-llm-worker');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('\nMake sure RabbitMQ is running:');
      console.error('  docker ps | grep rabbitmq');
      console.error('  ./scripts/start-ml-services.sh');
    }
  } finally {
    // Clean up
    if (channel) await channel.close();
    if (connection) await connection.close();
  }
}

// Run the test
console.log('LLM Metrics Test\n================\n');
testLLMMetrics().catch(console.error);