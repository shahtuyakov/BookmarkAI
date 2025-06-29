import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// Enable diagnostics for debugging (can be disabled in production)
if (process.env.OTEL_DEBUG === 'true') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

export function initializeTracing(): NodeSDK {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'bookmarkai-api-gateway';
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  
  // Create OTLP exporter for traces
  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers: {},
  });

  // Initialize the SDK with auto-instrumentation
  const sdk = new NodeSDK({
    serviceName,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable fs instrumentation to reduce noise
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        // Configure HTTP instrumentation
        '@opentelemetry/instrumentation-http': {
          requestHook: (span, request) => {
            // Add custom attributes to HTTP spans
            if (request && typeof request === 'object' && 'url' in request) {
              span.setAttribute('http.url.path', (request as any).url);
            }
          },
          ignoreIncomingRequestHook: (request) => {
            const url = (request as any).url || '';
            return /^\/(metrics|health|api\/ml\/metrics)/.test(url);
          },
        },
        // Configure NestJS instrumentation
        '@opentelemetry/instrumentation-nestjs-core': {
          enabled: true,
        },
        // Configure amqplib instrumentation
        '@opentelemetry/instrumentation-amqplib': {
          publishHook: (span, publishInfo) => {
            // Add custom attributes to AMQP publish spans
            if (publishInfo.exchange) {
              span.setAttribute('messaging.rabbitmq.exchange', publishInfo.exchange);
            }
            if (publishInfo.routingKey) {
              span.setAttribute('messaging.rabbitmq.routing_key', publishInfo.routingKey);
            }
          },
        },
      }),
    ],
  });

  // Initialize the SDK and register with the OpenTelemetry API
  sdk.start();

  // Gracefully shutdown on exit
  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.log('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });

  return sdk;
}