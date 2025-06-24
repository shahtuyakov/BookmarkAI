"""
Database models for ML results storage.
Based on ADR-025 specifications.
"""
import uuid
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy import (
    Column, String, Integer, JSON, DateTime, 
    UniqueConstraint, ForeignKey, create_engine
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from .celery_config import get_database_url

Base = declarative_base()


class MLResult(Base):
    """ML processing results table as specified in ADR-025."""
    
    __tablename__ = 'ml_results'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    share_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    task_type = Column(String, nullable=False)
    result_data = Column(JSON, nullable=False)
    model_version = Column(String, nullable=True)
    processing_ms = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Ensure unique constraint for deduplication
    __table_args__ = (
        UniqueConstraint('share_id', 'task_type', name='uq_share_task'),
    )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            'id': str(self.id),
            'share_id': str(self.share_id),
            'task_type': self.task_type,
            'result_data': self.result_data,
            'model_version': self.model_version,
            'processing_ms': self.processing_ms,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


# Database session management
_engine = None
_SessionLocal = None


def get_engine():
    """Get or create database engine."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            get_database_url(),
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,  # Verify connections before using
        )
    return _engine


def get_session() -> Session:
    """Get a new database session."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine()
        )
    return _SessionLocal()


def save_ml_result(
    share_id: uuid.UUID,
    task_type: str,
    result_data: Dict[str, Any],
    model_version: Optional[str] = None,
    processing_ms: Optional[int] = None
) -> MLResult:
    """
    Save ML processing result with conflict handling.
    Implements INSERT ... ON CONFLICT as specified in ADR-025.
    """
    session = get_session()
    try:
        # Try to get existing result
        existing = session.query(MLResult).filter_by(
            share_id=share_id,
            task_type=task_type
        ).first()
        
        if existing:
            # Update existing result
            existing.result_data = result_data
            existing.model_version = model_version
            existing.processing_ms = processing_ms
            result = existing
        else:
            # Create new result
            result = MLResult(
                share_id=share_id,
                task_type=task_type,
                result_data=result_data,
                model_version=model_version,
                processing_ms=processing_ms
            )
            session.add(result)
        
        session.commit()
        session.refresh(result)
        return result
        
    except Exception as e:
        session.rollback()
        raise e
    finally:
        session.close()