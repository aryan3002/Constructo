"""SQLAlchemy ORM models. Importing this package registers every table on Base.metadata."""

from app.models.company import Company
from app.models.decision import Decision, DecisionKind, DecisionState
from app.models.dpr import Dpr, DprStatus
from app.models.event_embedding import EventEmbedding
from app.models.homeowner_design import (
    DesignProfile,
    DesignReference,
    DesignSelection,
    ReferenceSource,
)
from app.models.homeowner_drawings import DrawingKind, PublishedDrawing
from app.models.homeowner_feed import (
    Change,
    Milestone,
    MilestoneStatus,
    PublishedPhoto,
    Update,
    UpdateType,
    WeeklySummary,
)
from app.models.homeowner_member import (
    HomeownerMember,
    HomeownerRequest,
    HomeownerRequestStatus,
    HomeownerSubRole,
    MemberStatus,
)
from app.models.homeowner_property import (
    Component,
    ComponentStatus,
    Property,
    Space,
    SpaceKind,
)
from app.models.homeowner_quiet import QuietPeriod, QuietStatus
from app.models.homeowner_visit import HomeownerVisitPhoto
from app.models.owner_brief import OwnerBrief
from app.models.payment import Payment, PaymentDirection, PaymentStatus
from app.models.permit import Permit, PermitStatus
from app.models.push_token import PushToken
from app.models.raw_message import RawMessageModel
from app.models.site import Site
from app.models.site_baseline import SiteBaseline
from app.models.site_event import SiteEventModel
from app.models.translation_cache import TranslationCache
from app.models.user import User, UserRole
from app.models.whatsapp_group import WhatsappGroup

__all__ = [
    "Change",
    "Company",
    "Component",
    "ComponentStatus",
    "Decision",
    "DecisionKind",
    "DecisionState",
    "DesignProfile",
    "DesignReference",
    "DesignSelection",
    "Dpr",
    "DprStatus",
    "DrawingKind",
    "EventEmbedding",
    "HomeownerMember",
    "HomeownerRequest",
    "HomeownerRequestStatus",
    "HomeownerSubRole",
    "MemberStatus",
    "Milestone",
    "MilestoneStatus",
    "OwnerBrief",
    "Payment",
    "PaymentDirection",
    "PaymentStatus",
    "Permit",
    "PermitStatus",
    "Property",
    "PublishedDrawing",
    "PublishedPhoto",
    "HomeownerVisitPhoto",
    "PushToken",
    "QuietPeriod",
    "QuietStatus",
    "RawMessageModel",
    "ReferenceSource",
    "Site",
    "SiteBaseline",
    "SiteEventModel",
    "Space",
    "SpaceKind",
    "TranslationCache",
    "Update",
    "UpdateType",
    "User",
    "UserRole",
    "WeeklySummary",
    "WhatsappGroup",
]
