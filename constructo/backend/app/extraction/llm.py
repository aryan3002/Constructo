"""LLM client abstraction.

Defines a provider-agnostic :class:`LLMClient` protocol, a :class:`FakeLLMClient`
for deterministic tests (no network), one real provider implementation
(:class:`OpenAILLMClient`), and an env-selected :func:`get_llm_client` factory.

The factory reads the provider and API key from the environment. If no key is
configured it falls back to the fake, so importing this module never requires
network access or credentials.
"""
from __future__ import annotations

import json
import os
from typing import Any, Protocol, runtime_checkable

from app.contracts.events import EventType


@runtime_checkable
class LLMClient(Protocol):
    """A minimal structured-completion interface.

    Implementations take a system prompt, a user prompt, and a JSON schema the
    response must conform to, and return the parsed JSON object (a ``dict``).
    """

    async def complete(self, system: str, user: str, json_schema: dict) -> dict: ...

    async def complete_vision(
        self, system: str, user: str, image_url: str | None, json_schema: dict
    ) -> dict:
        """Like :meth:`complete` but may *read* a photo at ``image_url``.

        Returns TEXT (e.g. a caption / description) — it never generates an
        image (README Hard Rule). H6.1 only freezes the method on the Protocol;
        the real vision provider lands in H6.6.
        """
        ...


# ---------------------------------------------------------------------------
# Fake (tests / no-key fallback)
# ---------------------------------------------------------------------------


# Lightweight construction-domain keyword tables reused by the fake LLM and the
# heuristic classifier. Hindi/Hinglish + English.
_ATTENDANCE_HINTS = (
    "mazdoor", "labour", "labor", "worker", "aaye", "haazri", "hazri", "attendance",
)
_MATERIAL_HINTS = (
    "cement",
    "bori",
    "bag",
    "steel",
    "sariya",
    "saria",
    "rebar",
    "bricks",
    "eent",
    "sand",
    "ret",
    "aggregate",
    "delivered",
    "delivery",
    "aa gaya",
    "aagaya",
    "truck",
    "load",
)
_INVOICE_HINTS = ("invoice", "challan", "bill", "gst", "tax invoice", "rs", "rupees", "amount")
_ISSUE_HINTS = ("problem", "issue", "dikkat", "samasya", "leak", "crack", "stop", "band", "delay")
_PROGRESS_HINTS = (
    "slab", "casting", "plaster", "completed", "ho gaya", "hogaya", "progress", "done",
)
_PAYMENT_HINTS = ("payment", "paisa", "advance", "bhej", "transfer", "pay")
_APPROVAL_HINTS = ("approve", "approved", "sanction", "ok kar", "permission")
_DRAWING_HINTS = ("drawing", "naksha", "plan", "blueprint", "dwg")

_NUM_WORDS = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "panch": 5, "ch?h": 6, "chah": 6,
    "saat": 7, "aath": 8, "nau": 9, "das": 10,
}


def _find_int(text: str) -> int | None:
    import re

    m = re.search(r"\d+", text)
    if m:
        return int(m.group())
    for word, val in _NUM_WORDS.items():
        if word in text:
            return val
    return None


def _find_amount(text: str) -> float | None:
    import re

    # e.g. "Rs 45,000" / "45000" / "₹1,20,000"
    m = re.search(r"(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d+)?)", text.lower())
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            return None
    return None


def _classify_text(text: str) -> EventType:
    """Crude keyword classifier shared by the fake LLM and :mod:`classify`."""
    t = (text or "").lower()
    if not t.strip():
        return EventType.unknown
    if any(k in t for k in _ATTENDANCE_HINTS):
        return EventType.attendance
    if any(k in t for k in _INVOICE_HINTS):
        return EventType.invoice_received
    if any(k in t for k in _MATERIAL_HINTS):
        return EventType.material_delivery
    if any(k in t for k in _PAYMENT_HINTS):
        return EventType.payment_request
    if any(k in t for k in _DRAWING_HINTS):
        return EventType.drawing_shared
    if any(k in t for k in _APPROVAL_HINTS):
        return EventType.approval
    if any(k in t for k in _ISSUE_HINTS):
        return EventType.issue
    if any(k in t for k in _PROGRESS_HINTS):
        return EventType.progress_update
    return EventType.unknown


class FakeLLMClient:
    """Deterministic, network-free LLM stand-in for tests.

    Either returns a pre-seeded canned response (``canned``) or derives a
    plausible structured ``fields`` payload from the user text using the same
    keyword heuristics as the production classifier.
    """

    def __init__(self, canned: dict | None = None) -> None:
        self.canned = canned
        self.calls: list[dict[str, Any]] = []

    async def complete(self, system: str, user: str, json_schema: dict) -> dict:
        self.calls.append({"system": system, "user": user, "json_schema": json_schema})
        if self.canned is not None:
            return self.canned

        text = user
        etype = _classify_text(text)
        fields: dict[str, Any] = {}
        confidence = 0.85

        if etype is EventType.attendance:
            headcount = _find_int(text)
            fields = {"headcount": headcount, "raw_phrase": text.strip()}
            confidence = 0.9 if headcount is not None else 0.5
        elif etype is EventType.material_delivery:
            qty = _find_int(text)
            material = None
            for m in ("cement", "steel", "sariya", "bricks", "sand", "aggregate"):
                if m in text.lower():
                    material = m
                    break
            fields = {"material": material, "quantity": qty, "unit": None, "vendor": None}
            confidence = 0.8 if material else 0.55
        elif etype is EventType.invoice_received:
            fields = {
                "vendor": None,
                "amount": _find_amount(text),
                "currency": "INR",
                "invoice_number": None,
            }
            confidence = 0.75
        elif etype is EventType.payment_request:
            fields = {"amount": _find_amount(text), "currency": "INR", "to": None}
            confidence = 0.7
        elif etype is EventType.issue:
            fields = {"description": text.strip(), "severity": None}
            confidence = 0.7
        elif etype is EventType.progress_update:
            fields = {"description": text.strip()}
            confidence = 0.7
        elif etype in (EventType.drawing_shared, EventType.approval):
            fields = {"description": text.strip()}
            confidence = 0.7
        else:
            fields = {"raw_text": text.strip()}
            confidence = 0.2

        return {
            "event_type": etype.value,
            "summary": text.strip()[:200] or "(no content)",
            "fields": fields,
            "confidence": confidence,
        }

    async def complete_vision(
        self, system: str, user: str, image_url: str | None, json_schema: dict
    ) -> dict:
        """Ignore the image, return the same result as :meth:`complete` (network-free).

        Records ``image_url`` in ``self.calls`` so a test can assert the URL was
        *passed* without any network.  The vision call is recorded as a single entry
        (with ``image_url``) — ``complete`` is *not* called separately so that
        ``calls[-1]["image_url"]`` is always the most-recent vision call.
        """
        if self.canned is not None:
            result = self.canned
        else:
            result = await self.complete(system, user, json_schema)
            # complete() already appended its own call entry; replace it with
            # the full vision entry so callers see image_url on calls[-1].
            self.calls.pop()
        self.calls.append(
            {"system": system, "user": user, "image_url": image_url, "json_schema": json_schema}
        )
        return result


# ---------------------------------------------------------------------------
# Real provider (OpenAI-compatible chat completions w/ JSON mode)
# ---------------------------------------------------------------------------


class OpenAILLMClient:
    """OpenAI-compatible structured completion client.

    Uses the official ``openai`` SDK if installed. Network calls only happen
    when :meth:`complete` is awaited, so importing this module is always safe.
    """

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self.api_key = api_key
        self.model = model

    async def complete(self, system: str, user: str, json_schema: dict) -> dict:
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:  # pragma: no cover - exercised only with the dep installed
            raise RuntimeError(
                "openai package not installed; install it or use FakeLLMClient"
            ) from exc

        client = AsyncOpenAI(api_key=self.api_key)
        schema_hint = json.dumps(json_schema)
        resp = await client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": f"{system}\n\nReturn JSON matching: {schema_hint}"},
                {"role": "user", "content": user},
            ],
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)

    async def complete_vision(  # pragma: no cover - live; real network path
        self, system: str, user: str, image_url: str | None, json_schema: dict
    ) -> dict:
        """Attach the image as an image-URL content block. Live — used by POST /specs/extract."""
        if not image_url:
            return await self.complete(system, user, json_schema)
        try:
            from openai import AsyncOpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai package not installed; install it or use FakeLLMClient"
            ) from exc

        client = AsyncOpenAI(api_key=self.api_key)
        schema_hint = json.dumps(json_schema)
        resp = await client.chat.completions.create(
            model=self.model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": f"{system}\n\nReturn JSON matching: {schema_hint}"},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                },
            ],
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)


class AzureOpenAILLMClient:
    """Azure OpenAI structured completion client.

    Azure differs from plain OpenAI: you call a *deployment name* (chosen when
    you deploy a model in the Azure portal), against a resource endpoint, with
    an explicit api_version. Network calls only happen when ``complete`` is
    awaited, so importing this module is always safe.
    """

    def __init__(
        self, *, api_key: str, endpoint: str, deployment: str, api_version: str
    ) -> None:
        self.api_key = api_key
        self.endpoint = endpoint
        self.deployment = deployment  # used as the `model` arg on Azure
        self.api_version = api_version

    async def complete(self, system: str, user: str, json_schema: dict) -> dict:
        try:
            from openai import AsyncAzureOpenAI
        except ImportError as exc:  # pragma: no cover - exercised only with the dep installed
            raise RuntimeError(
                "openai package not installed; install it or use FakeLLMClient"
            ) from exc

        client = AsyncAzureOpenAI(
            api_key=self.api_key,
            azure_endpoint=self.endpoint,
            api_version=self.api_version,
        )
        schema_hint = json.dumps(json_schema)
        resp = await client.chat.completions.create(
            model=self.deployment,  # Azure: this is the deployment name
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": f"{system}\n\nReturn JSON matching: {schema_hint}"},
                {"role": "user", "content": user},
            ],
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)

    async def complete_vision(  # pragma: no cover - live; real network path
        self, system: str, user: str, image_url: str | None, json_schema: dict
    ) -> dict:
        """Attach the image as an image-URL content block. Live — used by POST /specs/extract."""
        if not image_url:
            return await self.complete(system, user, json_schema)
        try:
            from openai import AsyncAzureOpenAI
        except ImportError as exc:
            raise RuntimeError(
                "openai package not installed; install it or use FakeLLMClient"
            ) from exc

        client = AsyncAzureOpenAI(
            api_key=self.api_key,
            azure_endpoint=self.endpoint,
            api_version=self.api_version,
        )
        schema_hint = json.dumps(json_schema)
        resp = await client.chat.completions.create(
            model=self.deployment,  # Azure: this is the deployment name
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": f"{system}\n\nReturn JSON matching: {schema_hint}"},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                },
            ],
        )
        content = resp.choices[0].message.content or "{}"
        return json.loads(content)


def get_llm_client(tier: str = "cheap") -> LLMClient:
    """Return an LLMClient for a routing tier.

    tier: "cheap" -> AZURE_OPENAI_DEPLOYMENT (gpt-4o-mini);
          "smart"/"vision" -> AZURE_OPENAI_DEPLOYMENT_SMART (gpt-4o),
          falling back to the cheap deployment when SMART is unset.
    Back-compat: no-arg call returns the cheap/default client.
    """
    provider = os.environ.get("LLM_PROVIDER", "openai").lower()
    if provider == "azure":
        key = os.environ.get("AZURE_OPENAI_API_KEY")
        endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
        cheap = os.environ.get("AZURE_OPENAI_DEPLOYMENT")
        smart = os.environ.get("AZURE_OPENAI_DEPLOYMENT_SMART") or cheap
        api_version = os.environ.get("AZURE_OPENAI_API_VERSION", "2024-10-21")
        deployment = smart if tier in ("smart", "vision") else cheap
        if key and endpoint and deployment:
            return AzureOpenAILLMClient(
                api_key=key, endpoint=endpoint,
                deployment=deployment, api_version=api_version,
            )
    elif provider == "openai":
        key = os.environ.get("OPENAI_API_KEY")
        if key:
            cheap = os.environ.get("LLM_MODEL", "gpt-4o-mini")
            smart = os.environ.get("LLM_MODEL_SMART") or cheap
            model = smart if tier in ("smart", "vision") else cheap
            return OpenAILLMClient(api_key=key, model=model)
    return FakeLLMClient()
