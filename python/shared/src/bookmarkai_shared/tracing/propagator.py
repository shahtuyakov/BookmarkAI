"""
RabbitMQ Trace Context Propagator for Python services
Implements W3C Trace Context propagation for AMQP/Celery messages
"""
import logging
from typing import Dict, Any, Optional, Tuple
from opentelemetry import trace, context
from opentelemetry.trace import SpanContext, TraceFlags, NonRecordingSpan
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

logger = logging.getLogger(__name__)


class RabbitMQTraceContextExtractor:
    """
    Extracts and injects W3C Trace Context from/to RabbitMQ message headers.
    
    This class handles trace propagation for messages passing through RabbitMQ,
    ensuring trace continuity between the API Gateway and Python ML services.
    """
    
    VERSION = "00"
    TRACEPARENT_HEADER = "traceparent"
    TRACESTATE_HEADER = "tracestate"
    
    def __init__(self):
        # Use the standard W3C propagator for actual extraction/injection
        self.propagator = TraceContextTextMapPropagator()
    
    def extract_context(self, headers: Optional[Dict[str, Any]]) -> context.Context:
        """
        Extract trace context from RabbitMQ/Celery message headers.
        
        Args:
            headers: Message headers containing trace information
            
        Returns:
            OpenTelemetry context with trace information
        """
        if not headers:
            logger.debug("No headers provided for trace extraction")
            return context.get_current()
        
        # Convert headers to carrier format for the propagator
        carrier = {}
        
        # Handle different header formats (AMQP headers might be bytes or strings)
        for key, value in headers.items():
            if key and value:
                key_lower = key.lower()
                
                # Convert bytes to string if necessary
                if isinstance(value, bytes):
                    value = value.decode('utf-8', errors='ignore')
                
                if key_lower == self.TRACEPARENT_HEADER.lower():
                    carrier[self.TRACEPARENT_HEADER] = str(value)
                    logger.debug(f"Found traceparent header: {value}")
                elif key_lower == self.TRACESTATE_HEADER.lower():
                    carrier[self.TRACESTATE_HEADER] = str(value)
                    logger.debug(f"Found tracestate header: {value}")
        
        # Extract context using the standard propagator
        try:
            extracted_context = self.propagator.extract(carrier=carrier)
            
            # Verify we actually got a valid span context
            span_context = trace.get_current_span(extracted_context).get_span_context()
            if span_context and span_context.is_valid:
                logger.debug(f"Successfully extracted trace context: trace_id={span_context.trace_id.hex()}, span_id={span_context.span_id.hex()}")
            else:
                logger.debug("Extracted context does not contain valid span context")
                
            return extracted_context
            
        except Exception as e:
            logger.warning(f"Failed to extract trace context: {e}")
            return context.get_current()
    
    def inject_context(self, headers: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Inject current trace context into headers for outgoing messages.
        
        Args:
            headers: Existing headers to add trace context to
            
        Returns:
            Headers with trace context added
        """
        if headers is None:
            headers = {}
        
        # Get current span
        current_span = trace.get_current_span()
        if not current_span:
            logger.debug("No active span for trace injection")
            return headers
        
        span_context = current_span.get_span_context()
        if not span_context or not span_context.is_valid:
            logger.debug("Current span has invalid context")
            return headers
        
        # Use a carrier for the propagator
        carrier = {}
        
        # Inject using the standard propagator
        try:
            self.propagator.inject(carrier=carrier)
            
            # Copy injected headers to the output
            for key, value in carrier.items():
                headers[key] = value
                logger.debug(f"Injected header {key}: {value}")
                
        except Exception as e:
            logger.warning(f"Failed to inject trace context: {e}")
        
        return headers
    
    def extract_from_celery_headers(self, celery_request) -> context.Context:
        """
        Extract trace context from Celery task request headers.
        
        This is a convenience method specifically for Celery tasks.
        
        Args:
            celery_request: Celery task request object
            
        Returns:
            OpenTelemetry context with trace information
        """
        headers = {}
        
        # Extract headers from Celery request
        if hasattr(celery_request, 'headers') and celery_request.headers:
            headers = celery_request.headers
        elif hasattr(celery_request, '__headers__') and celery_request.__headers__:
            headers = celery_request.__headers__
        
        return self.extract_context(headers)
    
    def parse_traceparent(self, traceparent: str) -> Optional[SpanContext]:
        """
        Parse W3C traceparent header into SpanContext.
        
        Format: version-trace_id-span_id-trace_flags
        Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
        
        Args:
            traceparent: W3C traceparent header value
            
        Returns:
            SpanContext if valid, None otherwise
        """
        if not traceparent:
            return None
        
        parts = traceparent.split('-')
        if len(parts) != 4:
            logger.warning(f"Invalid traceparent format: {traceparent}")
            return None
        
        version, trace_id_hex, span_id_hex, trace_flags_hex = parts
        
        # Validate version
        if version != self.VERSION:
            logger.warning(f"Unsupported traceparent version: {version}")
            return None
        
        try:
            # Parse trace ID (32 hex chars -> 16 bytes)
            if len(trace_id_hex) != 32 or not all(c in '0123456789abcdef' for c in trace_id_hex.lower()):
                logger.warning(f"Invalid trace ID: {trace_id_hex}")
                return None
            trace_id = int(trace_id_hex, 16)
            
            # Parse span ID (16 hex chars -> 8 bytes)
            if len(span_id_hex) != 16 or not all(c in '0123456789abcdef' for c in span_id_hex.lower()):
                logger.warning(f"Invalid span ID: {span_id_hex}")
                return None
            span_id = int(span_id_hex, 16)
            
            # Parse trace flags
            trace_flags = TraceFlags(int(trace_flags_hex, 16))
            
            # Validate IDs are not zero
            if trace_id == 0 or span_id == 0:
                logger.warning("Trace ID or span ID is zero")
                return None
            
            return SpanContext(
                trace_id=trace_id,
                span_id=span_id,
                is_remote=True,
                trace_flags=trace_flags,
            )
            
        except ValueError as e:
            logger.warning(f"Failed to parse traceparent: {e}")
            return None


# Global instance for convenience
trace_propagator = RabbitMQTraceContextExtractor()


def trace_celery_task_with_propagation(task_name: str):
    """
    Enhanced Celery task decorator that properly extracts trace context from message headers.
    
    This decorator replaces the one in tracing.py for better trace propagation support.
    
    Args:
        task_name: Name of the task for the span
    """
    def decorator(func):
        def wrapper(self, *args, **kwargs):
            # Get Celery request object
            request = self.request if hasattr(self, 'request') else None
            
            # Extract trace context from headers
            if request:
                ctx = trace_propagator.extract_from_celery_headers(request)
            else:
                logger.warning(f"No Celery request available for task {task_name}")
                ctx = context.get_current()
            
            # Start span with extracted context as parent
            tracer = trace.get_tracer(task_name.split('.')[0])
            
            with context.use(ctx):
                with tracer.start_as_current_span(
                    f"celery.task.{task_name}",
                    kind=trace.SpanKind.CONSUMER
                ) as span:
                    # Set standard attributes
                    span.set_attribute("messaging.system", "rabbitmq")
                    span.set_attribute("messaging.destination", f"ml.{task_name.split('.')[0]}")
                    span.set_attribute("messaging.operation", "receive")
                    span.set_attribute("celery.task_name", task_name)
                    
                    # Add request ID if available
                    if request and hasattr(request, 'id'):
                        span.set_attribute("celery.task_id", request.id)
                    
                    # Add share_id if provided
                    if 'share_id' in kwargs:
                        span.set_attribute("ml.share_id", kwargs['share_id'])
                    
                    try:
                        # Execute the task
                        result = func(self, *args, **kwargs)
                        span.set_status(trace.Status(trace.StatusCode.OK))
                        return result
                        
                    except Exception as e:
                        # Record exception and set error status
                        span.record_exception(e)
                        span.set_status(
                            trace.Status(trace.StatusCode.ERROR, str(e))
                        )
                        raise
        
        return wrapper
    return decorator