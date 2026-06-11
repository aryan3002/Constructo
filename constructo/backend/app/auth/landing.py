"""Role -> "where do I land" map (the IA's first-run destination per role).

Single source of truth shared by the invite-accept flow and the /auth/me/landing
lookup so the backend and the web client never disagree about a role's home.

  owner / pm        -> command brief (the exceptions-first home)
  supervisor        -> capture (photo/voice first; near-zero friction)
  accountant        -> reconcile (payments vs challans)
  labor_contractor  -> attendance (mukadam marks the crew present)
  procurement       -> orders (material POs / deliveries)
"""
from app.models import UserRole

ROLE_LANDING: dict[UserRole, str] = {
    UserRole.owner: "brief",
    UserRole.pm: "brief",
    UserRole.supervisor: "capture",
    UserRole.accountant: "reconcile",
    UserRole.labor_contractor: "attendance",
    UserRole.procurement: "orders",
    # Architect (design authority) lands on the web spec-desk.
    UserRole.architect: "spec_desk",
    # Homeowner app lands on the calm "am I okay?" home (Daylight).
    UserRole.homeowner: "home",
}

# Roles that get a near-zero-friction, free-seat onboarding (single coachmark,
# no company setup). Supervisor & mukadam (labor_contractor) per the brief.
FREE_SEAT_ROLES: frozenset[UserRole] = frozenset(
    {UserRole.supervisor, UserRole.labor_contractor}
)


def landing_for(role: UserRole) -> str:
    return ROLE_LANDING.get(role, "brief")
