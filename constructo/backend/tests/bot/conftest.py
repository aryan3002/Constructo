"""Bot test fixtures: a network-free fake sender + builder helpers."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.bot import sender as sender_mod
from app.models import (
    Company,
    Decision,
    DecisionKind,
    RawMessageModel,
    Site,
    SiteEventModel,
    User,
    UserRole,
    WhatsappGroup,
)


@dataclass
class FakeSender:
    """Records every send instead of touching the network. Drop-in for
    ``app.bot.sender.send``."""

    calls: list[dict[str, Any]] = field(default_factory=list)

    async def send(
        self,
        to: str,
        *,
        text: str | None = None,
        react_to: str | None = None,
        reply_to: str | None = None,
        dm: bool = False,
        idempotency_key: str | None = None,
    ) -> sender_mod.SendResult:
        kind = "reaction" if react_to is not None else "text"
        self.calls.append(
            {
                "to": to, "text": text, "react_to": react_to, "reply_to": reply_to,
                "dm": dm, "kind": kind, "idempotency_key": idempotency_key,
            }
        )
        return sender_mod.SendResult(
            ok=True, message_id=f"fake-{len(self.calls)}", transport="fake",
            kind=kind, to=to, text=text, dm=dm,
        )

    # convenience accessors for assertions
    @property
    def texts(self) -> list[str]:
        return [c["text"] for c in self.calls if c["text"]]

    @property
    def reactions(self) -> list[dict[str, Any]]:
        return [c for c in self.calls if c["kind"] == "reaction"]

    @property
    def dms(self) -> list[dict[str, Any]]:
        return [c for c in self.calls if c["dm"]]


@pytest.fixture
def fake_sender(monkeypatch) -> FakeSender:
    fs = FakeSender()
    monkeypatch.setattr(sender_mod, "send", fs.send)
    return fs


@pytest_asyncio.fixture
async def world(db_session: AsyncSession):
    """A minimal company / owner / site / whatsapp group graph for bot tests."""

    class World:
        def __init__(self, s: AsyncSession):
            self.s = s

        async def setup(self):
            self.company = Company(name="Nivaan Builders")
            self.s.add(self.company)
            await self.s.flush()

            self.owner = User(
                company_id=self.company.id, role=UserRole.owner,
                phone="+919800000001", name="Owner",
            )
            self.s.add(self.owner)

            self.site = Site(company_id=self.company.id, name="Site A")
            self.s.add(self.site)
            await self.s.flush()

            self.chat_jid = "120363-group@g.us"
            self.group = WhatsappGroup(
                company_id=self.company.id, site_id=self.site.id,
                external_group_id=self.chat_jid, source="baileys", label="Site A Group",
            )
            self.s.add(self.group)
            await self.s.flush()
            return self

        async def inbound(self, text: str, *, media_type: str = "text") -> RawMessageModel:
            msg = RawMessageModel(
                source="baileys",
                external_group_id=self.chat_jid,
                sender_id="+919811111111",
                sender_name="Supervisor",
                media_type=media_type,
                text=text,
                sent_at=datetime.now(UTC),
            )
            self.s.add(msg)
            await self.s.flush()
            return msg

        async def event(
            self, *, event_type: str, summary: str, on: date | None = None,
            fields: dict | None = None,
        ) -> SiteEventModel:
            ev = SiteEventModel(
                site_id=self.site.id,
                event_type=event_type,
                occurred_on=on or date.today(),
                summary=summary,
                fields=fields or {},
                confidence=0.9,
            )
            self.s.add(ev)
            await self.s.flush()
            return ev

        async def decision(
            self, *, title: str, kind: DecisionKind = DecisionKind.approval,
            evidence: list[UUID] | None = None,
        ) -> Decision:
            d = Decision(
                company_id=self.company.id, site_id=self.site.id, kind=kind,
                title=title, evidence_event_ids=evidence or [],
            )
            self.s.add(d)
            await self.s.flush()
            return d

    return await World(db_session).setup()
