"""Observability configuration for ML services."""

import logging
from typing import Any, Dict, Optional

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.celery import CeleryInstrumentor
from opentelemetry.instrumentation.psycopg2 import Psycopg2Instrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .config import settings


# Global tracer instance
_tracer: Optional[trace.Tracer] = None


def init_telemetry() -> None:
    """Initialize OpenTelemetry instrumentation."""
    # Create resource with service information
    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "service.version": "1.0.0",
            "deployment.environment": "development",
        }
    )
    
    # Configure tracer provider
    provider = TracerProvider(resource=resource)
    
    # Configure OTLP exporter
    otlp_exporter = OTLPSpanExporter(
        endpoint=settings.otel_exporter_otlp_endpoint,
        insecure=True,
    )
    
    # Add batch processor
    provider.add_span_processor(BatchSpanProcessor(otlp_exporter))
    
    # Set as global provider
    trace.set_tracer_provider(provider)
    
    # Instrument libraries
    CeleryInstrumentor().instrument()
    Psycopg2Instrumentor().instrument()
    
    # Configure logging
    logging.getLogger("opentelemetry").setLevel(logging.WARNING)


def get_tracer() -> trace.Tracer:
    """Get the global tracer instance."""
    global _tracer
    
    if _tracer is None:
        _tracer = trace.get_tracer(__name__)
    
    return _tracer


def extract_trace_context(headers: Dict[str, str]) -> Optional[Dict[str, Any]]:
    """Extract W3C trace context from headers."""
    traceparent = headers.get("traceparent")
    if not traceparent:
        return None
    
    # Parse traceparent header
    # Format: version-trace_id-parent_id-trace_flags
    parts = traceparent.split("-")
    if len(parts) != 4:
        return None
    
    return {
        "trace_id": parts[1],
        "parent_id": parts[2],
        "trace_flags": parts[3],
    }


def inject_trace_context() -> Dict[str, str]:
    """Inject current trace context into headers."""
    headers = {}
    
    # Get current span
    span = trace.get_current_span()
    if span and span.is_recording():
        ctx = span.get_span_context()
        # Format W3C traceparent header
        headers["traceparent"] = f"00-{format(ctx.trace_id, '032x')}-{format(ctx.span_id, '016x')}-01"
    
    return headers