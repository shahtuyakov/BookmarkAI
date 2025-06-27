/**
 * Test script for vector embedding task publishing
 * 
 * This script tests the ML producer's ability to publish embedding tasks
 * to the RabbitMQ queue for processing by the vector worker.
 */

const amqplib = require('amqplib');
const { v4: uuidv4 } = require('uuid');

async function testEmbeddingTask() {
  let connection;
  let channel;

  try {
    // Connect to RabbitMQ
    console.log('🔌 Connecting to RabbitMQ...');
    connection = await amqplib.connect('amqp://ml:ml_password@localhost:5672/');
    channel = await connection.createChannel();

    console.log('✅ Connected to RabbitMQ');

    // Prepare test data
    const testShareId = uuidv4();
    const testContent = {
      text: 'This is a test content for vector embeddings. It contains information about machine learning, artificial intelligence, and neural networks. The goal is to test whether our embedding service can process this content and generate meaningful vector representations.',
      type: 'article',
      metadata: {
        title: 'Test Article for Embeddings',
        url: 'https://example.com/test-article',
        author: 'Test Author',
        platform: 'test'
      }
    };

    // Create the Celery task message
    const celeryMessage = {
      id: 'test-' + Date.now(),
      task: 'vector_service.tasks.generate_embeddings',
      args: [],
      kwargs: {
        share_id: testShareId,
        content: testContent,
        options: {
          embedding_type: 'content',
          // Let the service auto-select the model
        }
      },
      retries: 0,
      eta: null,
      expires: null,
      headers: {
        lang: 'js',
        task: 'vector_service.tasks.generate_embeddings',
        id: 'test-' + Date.now(),
        retries: 0,
        root_id: 'test-' + Date.now(),
        parent_id: null,
        group: null
      },
      priority: 0,
      reply_to: null,
      correlation_id: 'test-' + Date.now()
    };

    // Publish to the ml.embed queue
    const messageBuffer = Buffer.from(JSON.stringify(celeryMessage));
    
    console.log('📤 Publishing embedding task to ml.embed queue...');
    console.log('Share ID:', testShareId);
    console.log('Content length:', testContent.text.length, 'characters');
    
    const published = channel.publish(
      'bookmarkai.ml',  // exchange
      'ml.embed',       // routing key
      messageBuffer,
      {
        persistent: true,
        contentType: 'application/json',
        contentEncoding: 'utf-8'
      }
    );

    if (published) {
      console.log('✅ Embedding task published successfully!');
      console.log('');
      console.log('To view the task processing:');
      console.log('  1. Check RabbitMQ Management UI: http://localhost:15672');
      console.log('  2. View vector worker logs: docker logs -f bookmarkai-vector-worker');
      console.log('');
      console.log('Expected behavior:');
      console.log('  - Vector worker picks up the task');
      console.log('  - Content is preprocessed and chunked');
      console.log('  - Embeddings are generated via OpenAI API');
      console.log('  - Results are stored in the database');
      console.log('  - Metrics are tracked in Prometheus');
    } else {
      console.error('❌ Failed to publish message');
    }

    // Test batch embedding task
    console.log('\n📤 Testing batch embedding task...');
    
    const batchTasks = [
      {
        share_id: uuidv4(),
        content: {
          text: 'First test content for batch processing',
          type: 'caption',
          metadata: { platform: 'tiktok' }
        },
        options: { embedding_type: 'content' }
      },
      {
        share_id: uuidv4(),
        content: {
          text: 'Second test content for batch processing',
          type: 'tweet',
          metadata: { platform: 'twitter' }
        },
        options: { embedding_type: 'content' }
      },
      {
        share_id: uuidv4(),
        content: {
          text: 'Third test content for batch processing with a longer text that might require different model selection',
          type: 'comment',
          metadata: { platform: 'reddit' }
        },
        options: { embedding_type: 'content' }
      }
    ];

    const batchMessage = {
      id: 'test-batch-' + Date.now(),
      task: 'vector_service.tasks.generate_embeddings_batch',
      args: [],
      kwargs: {
        tasks: batchTasks
      },
      retries: 0,
      eta: null,
      expires: null,
      headers: {
        lang: 'js',
        task: 'vector_service.tasks.generate_embeddings_batch',
        id: 'test-batch-' + Date.now(),
        retries: 0,
        root_id: 'test-batch-' + Date.now(),
        parent_id: null,
        group: null
      },
      priority: 0,
      reply_to: null,
      correlation_id: 'test-batch-' + Date.now()
    };

    const batchBuffer = Buffer.from(JSON.stringify(batchMessage));
    
    const batchPublished = channel.publish(
      'bookmarkai.ml',
      'ml.embed',
      batchBuffer,
      {
        persistent: true,
        contentType: 'application/json',
        contentEncoding: 'utf-8'
      }
    );

    if (batchPublished) {
      console.log('✅ Batch embedding task published successfully!');
      console.log('Batch contains', batchTasks.length, 'tasks');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    // Clean up
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('\n🔌 Connection closed');
  }
}

// Run the test
console.log('🧪 Testing Vector Embedding Task Publishing\n');
testEmbeddingTask().catch(console.error);