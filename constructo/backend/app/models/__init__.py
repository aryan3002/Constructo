"""SQLAlchemy ORM models. Importing this package registers every table on Base.metadata."""

from app.models.company import Company
from app.models.decision import Decision, DecisionKind, DecisionState
from app.models.event_embedding import EventEmbedding
from app.models.owner_brief import OwnerBrief
from app.models.payment import Payment, PaymentDirection, PaymentStatus
from app.models.permit import Permit, PermitStatus
from app.models.raw_message import RawMessageModel
from app.models.site import Site
from app.models.site_baseline import SiteBaseline
from app.models.site_event import SiteEventModel
from app.models.user import User, UserRole
from app.models.whatsapp_group import WhatsappGroup

__all__ = [
    "Company",
    "Decision",
    "DecisionKind",
    "DecisionState",
    "EventEmbedding",
    "OwnerBrief",
    "Payment",
    "PaymentDirection",
    "PaymentStatus",
    "Permit",
    "PermitStatus",
    "RawMessageModel",
    "Site",
    "SiteBaseline",
    "SiteEventModel",
    "User",
    "UserRole",
    "WhatsappGroup",
]
