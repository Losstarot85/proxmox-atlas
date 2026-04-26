"""
Centralized structured logging for Proxmox Atlas.
Outputs JSON in production for compatibility with log aggregators (Loki, ELK, CloudWatch).
"""

import logging
import sys
import os
import re

try:
    import structlog
    _HAS_STRUCTLOG = True
except ImportError:
    _HAS_STRUCTLOG = False

# Patterns for sensitive data that should never appear in logs
_SENSITIVE_PATTERNS = [
    re.compile(r'PVEAPIToken=[^\s&"\']+'),          # Proxmox API tokens
    re.compile(r'Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+'),  # JWT in headers
    re.compile(r'token=[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+'),      # JWT in query params
]
_REDACTED = "***REDACTED***"


def _redact_value(value):
    """Recursively redact sensitive patterns from a value."""
    if isinstance(value, str):
        for pattern in _SENSITIVE_PATTERNS:
            value = pattern.sub(_REDACTED, value)
        return value
    if isinstance(value, dict):
        return {k: _redact_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(_redact_value(v) for v in value)
    return value


def _redact_secrets(logger, method_name, event_dict):
    """Structlog processor: redact sensitive tokens from all event fields."""
    for key in list(event_dict.keys()):
        event_dict[key] = _redact_value(event_dict[key])
    return event_dict


def setup_logging():
    """Configure structured logging. Falls back to stdlib if structlog is not installed."""
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()

    if _HAS_STRUCTLOG:
        structlog.configure(
            processors=[
                structlog.contextvars.merge_contextvars,
                structlog.processors.add_log_level,
                structlog.processors.TimeStamper(fmt="iso"),
                structlog.processors.StackInfoRenderer(),
                structlog.processors.format_exc_info,
                _redact_secrets,  # Sanitize before serialization
                structlog.processors.JSONRenderer(),
            ],
            wrapper_class=structlog.make_filtering_bound_logger(
                getattr(logging, log_level, logging.INFO)
            ),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(file=sys.stderr),
            cache_logger_on_first_use=True,
        )
    else:
        # Fallback: standard library logging with structured-ish format
        logging.basicConfig(
            level=getattr(logging, log_level, logging.INFO),
            format="%(asctime)s [%(levelname)s] %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S",
            stream=sys.stderr,
        )


def get_logger(name: str = "atlas"):
    """Get a logger instance. Returns structlog logger if available, else stdlib."""
    if _HAS_STRUCTLOG:
        return structlog.get_logger(name)
    else:
        return logging.getLogger(name)
