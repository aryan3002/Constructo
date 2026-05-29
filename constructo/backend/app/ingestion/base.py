from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from app.contracts.events import RawMessage


class IngestionSource(ABC):
    name: str

    @abstractmethod
    async def messages(self) -> AsyncIterator[RawMessage]: ...
