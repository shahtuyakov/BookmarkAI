"""
OpenTelemetry tracing configuration for Python ML workers
"""
import os
from typing import Optional, Dict, Any
from opentelemetry import trace, baggage, context
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.trace import Status, StatusCode
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
import logging

logger = logging.getLogger(__name__)

# Global tracer instance
_tracer: Optional[trace.Tracer] = None


def initialize_tracing(service_name: str) -> None:
    """
    Initialize OpenTelemetry tracing for the service
    
    Args:
        service_name: Name of the service (e.g., 'llm-service', 'whisper-service')
    """
    global _tracer
    
    # Create resource identifying the service
    resource = Resource.create({
        "service.name": f"bookmarkai-{service_name}",
        "service.version": os.getenv("SERVICE_VERSION", "1.0.0"),
        "environment": os.getenv("ENVIRONMENT", "development"),
    })
    
    # Create tracer provider
    provider = TracerProvider(resource=resource)
    
    # Configure OTLP exporter
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4318")
    otlp_exporter = OTLPSpanExporter(
        endpoint=f"{otlp_endpoint}/v1/traces",
        headers={},
    )
    
    # Add batch processor
    provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
    
    # Set as global tracer provider
    trace.set_tracer_provider(provider)
    
    # Get tracer for this service
    _tracer = trace.get_tracer(service_name)
    
    # Instrument Celery
    CeleryInstrumentor().instrument()
    
    logger.info(f"OpenTelemetry tracing initialized for {service_name}")


def get_tracer() -> trace.Tracer:
    """Get the global tracer instance"""
    if _tracer is None:
        raise RuntimeError("Tracing not initialized. Call initialize_tracing() first.")
    return _tracer


def extract_trace_context(headers: Dict[str, Any]) -> context.Context:
    """
    Extract trace context from message headers
    
    Args:
        headers: Message headers containing trace information
        
    Returns:
        OpenTelemetry context with trace information
    """
    propagator = TraceContextTextMapPropagator()
    
    # Convert headers to carrier format
    carrier = {}
    if headers:
        # Check for traceparent header (case-insensitive)
        for key, value in headers.items():
            if key and value:
                key_lower = key.lower()
                if key_lower == "traceparent":
                    carrier["traceparent"] = str(value)
                elif key_lower == "tracestate":
                    carrier["tracestate"] = str(value)
    
    # Extract context (returns empty context if no trace info found)
    try:
        ctx = propagator.extract(carrier=carrier)
        # Log debug info if we successfully extracted a trace context
        if carrier.get("traceparent"):
            logger.debug(f"Extracted trace context from traceparent: {carrier.get('traceparent')}")
    except Exception as e:
        logger.warning(f"Failed to extract trace context: {e}")
        ctx = context.get_current()
    
    return ctx


def create_span_from_context(
    name: str, 
    ctx: context.Context,
    kind: trace.SpanKind = trace.SpanKind.CONSUMER
) -> trace.Span:
    """
    Create a new span with extracted context as parent
    
    Args:
        name: Span name
        ctx: Extracted context
        kind: Span kind (default: CONSUMER)
        
    Returns:
        New span with parent context
    """
    tracer = get_tracer()
    
    # Create span with parent context
    token = context.attach(ctx)
    try:
        span = tracer.start_span(name, kind=kind)
    finally:
        context.detach(token)
    
    return span


def trace_celery_task(task_name: str):
    """
    Decorator to trace Celery tasks with proper context propagation
    
    Args:
        task_name: Name of the task for the span
    """
    def decorator(func):
        def wrapper(*args, **kwargs):
            # Extract trace context from Celery headers
            headers = {}
            
            # Try to get the current Celery task context
            from celery import current_task
            task = current_task
            
            if task and hasattr(task, 'request') and hasattr(task.request, 'headers'):
                headers = task.request.headers or {}
                # Log only when trace context is found for debugging
                if 'traceparent' in headers:
                    logger.debug(f"Task {task_name} - Trace context found: {headers['traceparent']}")
            
            # Extract context from headers
            ctx = extract_trace_context(headers)
            
            # Create span with parent context
            span = create_span_from_context(
                f"celery.task.{task_name}",
                ctx,
                kind=trace.SpanKind.CONSUMER
            )
            
            # Set span attributes
            span.set_attribute("celery.task_name", task_name)
            span.set_attribute("messaging.system", "celery")
            span.set_attribute("messaging.destination", f"ml.{task_name.split('.')[0]}")
            
            # Add task-specific attributes
            if 'share_id' in kwargs:
                span.set_attribute("ml.share_id", kwargs['share_id'])
            
            try:
                # Execute task
                with trace.use_span(span, end_on_exit=False):
                    result = func(*args, **kwargs)
                
                span.set_status(Status(StatusCode.OK))
                return result
                
            except Exception as e:
                # Record exception
                span.record_exception(e)
                span.set_status(Status(StatusCode.ERROR, str(e)))
                raise
                
            finally:
                span.end()
        
        return wrapper
    return decorator