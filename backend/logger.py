"""
Centralized structured logging for Proxmox Atlas.
Outputs JSON in production for compatibility with log aggregators (Loki, ELK, CloudWatch).
"""

import logging
import sys
import os

try:
    import structlog
    _HAS_STRUCTLOG = True
except ImportError:
    _HAS_STRUCTLOG = False


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
