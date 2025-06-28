#!/usr/bin/env python3

import pika
import ssl
import os

print("Testing RabbitMQ TLS connections with proper certificates...")

# Path to certificates
cert_dir = "docker/rabbitmq-cluster/certificates"
ca_cert = os.path.join(cert_dir, "ca_certificate.pem")

# Verify certificates exist
if not os.path.exists(ca_cert):
    print(f"ERROR: CA certificate not found at {ca_cert}")
    print("Please run: cd docker/rabbitmq-cluster && ./generate-certificates.sh")
    exit(1)

print(f"Using CA certificate: {ca_cert}")

# Test configurations
tests = [
    {
        "name": "AMQP Non-TLS Load Balancer",
        "url": "amqp://ml:ml_password@localhost:5680/",
        "ssl": False
    },
    {
        "name": "AMQPS TLS Load Balancer (with CA verification)",
        "url": "amqps://ml:ml_password@localhost:5690/",
        "ssl": True,
        "verify": True
    },
    {
        "name": "AMQPS TLS Node 1 Direct (with CA verification)",
        "url": "amqps://ml:ml_password@localhost:5691/",
        "ssl": True,
        "verify": True
    },
    {
        "name": "AMQPS TLS Load Balancer (no verification)",
        "url": "amqps://ml:ml_password@localhost:5690/",
        "ssl": True,
        "verify": False
    }
]

for test in tests:
    print(f"\nTesting {test['name']}...")
    try:
        parameters = pika.URLParameters(test['url'])
        
        if test['ssl']:
            if test['verify']:
                # Create SSL context with CA certificate
                ssl_context = ssl.create_default_context(cafile=ca_cert)
                ssl_context.check_hostname = False  # Self-signed cert won't match hostname
            else:
                # Create SSL context without verification
                ssl_context = ssl.create_default_context()
                ssl_context.check_hostname = False
                ssl_context.verify_mode = ssl.CERT_NONE
            
            parameters.ssl_options = pika.SSLOptions(context=ssl_context)
        
        connection = pika.BlockingConnection(parameters)
        print("✓ SUCCESS - Connected!")
        
        # Test channel creation
        channel = connection.channel()
        print("✓ SUCCESS - Channel created!")
        
        # Declare a test queue
        result = channel.queue_declare(queue='test_tls_queue', durable=True, arguments={'x-queue-type': 'quorum'})
        print(f"✓ SUCCESS - Queue declared: {result.method.queue}")
        
        connection.close()
        
    except Exception as e:
        print(f"✗ FAILED - {str(e)}")

print("\n=== Testing Python Celery Configuration ===")

# Test with CA certificate
os.environ['RABBITMQ_URL'] = 'amqps://ml:ml_password@localhost:5690/'
os.environ['RABBITMQ_USE_SSL'] = 'true'
os.environ['RABBITMQ_SSL_CACERT'] = ca_cert
os.environ['RABBITMQ_VERIFY_PEER'] = 'true'

try:
    # Import our Celery config
    import sys
    sys.path.insert(0, 'python/shared/src')
    from bookmarkai_shared.celery_config import get_celery_config, get_ssl_options, get_broker_transport_options
    
    celery_config = get_celery_config()
    broker_url = celery_config.get('broker_url', 'Not set')
    ssl_options = get_ssl_options()
    transport_options = get_broker_transport_options()
    
    print(f"Broker URL: {broker_url}")
    print(f"SSL Enabled: {ssl_options is not None}")
    print(f"CA Certificate: {os.environ.get('RABBITMQ_SSL_CACERT', 'Not set')}")
    print(f"Verify Peer: {os.environ.get('RABBITMQ_VERIFY_PEER', 'true')}")
    
    if ssl_options:
        print("SSL Options configured:")
        for key, value in ssl_options.items():
            if key == 'ca_certs':
                print(f"  - {key}: {value}")
            else:
                print(f"  - {key}: {value}")
    
    print("✓ Celery configuration loaded successfully!")
    
except Exception as e:
    print(f"✗ FAILED - {str(e)}")

print("\n=== Node.js Configuration Example ===")
print("To use certificates in Node.js, set these environment variables:")
print(f"RABBITMQ_SSL_CACERT={os.path.abspath(ca_cert)}")
print("RABBITMQ_VERIFY_PEER=true")
print("")
print("Or for testing without verification:")
print("RABBITMQ_VERIFY_PEER=false")