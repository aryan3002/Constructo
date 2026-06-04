from pydantic import BaseModel, ConfigDict, Field


class BillingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    plan: str | None
    billing_email: str | None
    billing_contact: str | None
    notes: str | None


class BillingIn(BaseModel):
    """Partial billing-tracking update; only provided fields change."""

    plan: str | None = Field(default=None, max_length=64)
    billing_email: str | None = Field(default=None, max_length=200)
    billing_contact: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
