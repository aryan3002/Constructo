"""SQLAlchemy ORM models. Importing this package registers every table on Base.metadata."""

from app.models.company import Company
from app.models.owner_brief import OwnerBrief
from app.models.raw_message import RawMessageModel
from app.models.site import Site
from app.models.site_event import SiteEventModel
from app.models.user import User, UserRole
from app.models.whatsapp_group import WhatsappGroup

__all__ = [
    "Company",
    "OwnerBrief",
    "RawMessageModel",
    "Site",
    "SiteEventModel",
    "User",
    "UserRole",
    "WhatsappGroup",
]
