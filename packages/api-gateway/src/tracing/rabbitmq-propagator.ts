import { Context, SpanContext, TextMapGetter, TextMapSetter, TraceFlags, context, trace } from '@opentelemetry/api';
import { isTracingSuppressed } from '@opentelemetry/core';
import * as amqp from 'amqplib';

const TRACE_PARENT_HEADER = 'traceparent';
const TRACE_STATE_HEADER = 'tracestate';

/**
 * RabbitMQ Trace Context Propagator
 * Implements W3C Trace Context propagation for AMQP messages
 * 
 * This propagator ensures trace continuity when messages pass through RabbitMQ
 * between services, maintaining the distributed trace across async boundaries.
 */
export class RabbitMQPropagator {
  private static readonly VERSION = '00';
  private static readonly TRACE_FLAG_SAMPLED = '01';
  private static readonly TRACE_FLAG_NOT_SAMPLED = '00';

  /**
   * Inject trace context into AMQP message headers
   * @param context - The OpenTelemetry context containing span information
   * @param carrier - The AMQP publish options where headers will be injected
   * @param setter - Optional custom setter (defaults to AMQP header setter)
   */
  inject(context: Context, carrier: amqp.Options.Publish, setter?: TextMapSetter): void {
    if (isTracingSuppressed(context)) {
      return;
    }

    const span = trace.getSpan(context);
    if (!span) {
      return;
    }

    const spanContext = span.spanContext();
    if (!spanContext || !this.isValidSpanContext(spanContext)) {
      return;
    }

    // Initialize headers if not present
    if (!carrier.headers) {
      carrier.headers = {};
    }

    // Use custom setter or default AMQP header setter
    const headerSetter = setter || {
      set: (carrier: any, key: string, value: string) => {
        carrier.headers[key] = value;
      }
    };

    // Format: version-traceid-spanid-traceflags
    const traceparent = `${RabbitMQPropagator.VERSION}-${spanContext.traceId}-${spanContext.spanId}-${
      spanContext.traceFlags & TraceFlags.SAMPLED
        ? RabbitMQPropagator.TRACE_FLAG_SAMPLED
        : RabbitMQPropagator.TRACE_FLAG_NOT_SAMPLED
    }`;

    headerSetter.set(carrier, TRACE_PARENT_HEADER, traceparent);

    // Add trace state if present
    if (spanContext.traceState) {
      const traceStateString = spanContext.traceState.serialize();
      if (traceStateString) {
        headerSetter.set(carrier, TRACE_STATE_HEADER, traceStateString);
      }
    }
  }

  /**
   * Extract trace context from AMQP message headers
   * @param context - The current OpenTelemetry context
   * @param carrier - The source object containing headers (e.g., message properties)
   * @param getter - Optional custom getter (defaults to AMQP header getter)
   * @returns Context with extracted span information
   */
  extract(context: Context, carrier: any, getter?: TextMapGetter): Context {
    // Use custom getter or default AMQP header getter
    const headerGetter = getter || {
      keys: (carrier: any) => {
        return carrier.headers ? Object.keys(carrier.headers) : [];
      },
      get: (carrier: any, key: string) => {
        return carrier.headers?.[key] || undefined;
      }
    };

    const traceparent = headerGetter.get(carrier, TRACE_PARENT_HEADER);
    if (!traceparent || typeof traceparent !== 'string') {
      return context;
    }

    const spanContext = this.parseTraceparent(traceparent as string);
    if (!spanContext) {
      return context;
    }

    // Extract trace state if present
    const tracestate = headerGetter.get(carrier, TRACE_STATE_HEADER);
    if (tracestate && typeof tracestate === 'string') {
      // Note: In a real implementation, you'd parse the tracestate properly
      // For now, we'll skip this as it requires the TraceState API
    }

    return trace.setSpanContext(context, spanContext);
  }

  /**
   * Parse W3C traceparent header
   * @param traceparent - The traceparent header value
   * @returns Parsed SpanContext or null if invalid
   */
  private parseTraceparent(traceparent: string): SpanContext | null {
    const parts = traceparent.split('-');
    if (parts.length !== 4) {
      return null;
    }

    const [version, traceId, spanId, flags] = parts;

    // Validate version
    if (version !== RabbitMQPropagator.VERSION) {
      return null;
    }

    // Validate trace ID (32 hex chars)
    if (!this.isValidTraceId(traceId)) {
      return null;
    }

    // Validate span ID (16 hex chars)
    if (!this.isValidSpanId(spanId)) {
      return null;
    }

    // Parse flags
    const traceFlags = parseInt(flags, 16);
    if (isNaN(traceFlags)) {
      return null;
    }

    return {
      traceId,
      spanId,
      traceFlags,
      isRemote: true,
    };
  }

  /**
   * Validate span context
   */
  private isValidSpanContext(spanContext: SpanContext): boolean {
    return (
      this.isValidTraceId(spanContext.traceId) &&
      this.isValidSpanId(spanContext.spanId)
    );
  }

  /**
   * Validate trace ID format (32 hex characters, not all zeros)
   */
  private isValidTraceId(traceId: string): boolean {
    return (
      typeof traceId === 'string' &&
      traceId.length === 32 &&
      /^[0-9a-f]{32}$/.test(traceId) &&
      traceId !== '00000000000000000000000000000000'
    );
  }

  /**
   * Validate span ID format (16 hex characters, not all zeros)
   */
  private isValidSpanId(spanId: string): boolean {
    return (
      typeof spanId === 'string' &&
      spanId.length === 16 &&
      /^[0-9a-f]{16}$/.test(spanId) &&
      spanId !== '0000000000000000'
    );
  }

  /**
   * Helper method to inject context into a message before publishing
   * This is a convenience method for use in the ML producer service
   */
  injectContext(message: any, options: amqp.Options.Publish = {}): amqp.Options.Publish {
    const currentContext = context.active();
    this.inject(currentContext, options);
    return options;
  }

  /**
   * Helper method to extract context from received message properties
   * This is a convenience method for use when consuming messages
   */
  extractContext(messageProperties: any): Context {
    return this.extract(context.active(), messageProperties);
  }
}

// Export singleton instance
export const rabbitmqPropagator = new RabbitMQPropagator();