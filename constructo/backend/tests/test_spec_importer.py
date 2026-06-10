"""Importer: ParsedSpecRow -> Space/Component/Material/Spec, idempotently."""
from decimal import Decimal

from sqlalchemy import func, select

from app.models import Material, Space, Spec
from app.specs.import_parser import ParsedSpecRow
from app.specs.importer import import_rows


def _rows() -> list[ParsedSpecRow]:
    return [
        ParsedSpecRow(room="Living Room", element="Floor", category="Vitrified Tile",
                      name="Polished Vitrified Tile", brand="Kajaria", sku="ETW-8080",
                      colour="Ivory Beige", qty=Decimal("450"), wastage_pct=Decimal("10"),
                      unit="Sq Ft", approval_status="pending"),
        ParsedSpecRow(room="Living Room", element="Ceiling", category="Gypsum Board",
                      brand="Saint-Gobain", sku="SG-GYP-13", qty=Decimal("500"), unit="Sq Ft"),
        ParsedSpecRow(room="Master Bedroom", element="Floor", category="Engineered Wood",
                      brand="Pergo", sku="PG-OAK-38", qty=Decimal("320"), unit="Sq Ft"),
    ]


async def test_import_creates_spaces_components_materials_specs(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    await db_session.commit()

    stats = await import_rows(db_session, company.id, site.id, _rows())
    await db_session.commit()

    assert stats.specs == 3
    assert stats.spaces == 2          # Living Room, Master Bedroom
    assert stats.components == 3       # Floor, Ceiling (LR) + Floor (MB)
    assert stats.materials == 3        # 3 distinct SKUs
    assert (await db_session.scalar(select(func.count()).select_from(Spec))) == 3
    spec = await db_session.scalar(
        select(Spec)
        .join(Material, Material.id == Spec.material_id)
        .where(Material.sku == "ETW-8080")
    )
    assert spec.qty == Decimal("450.00")
    assert spec.label == "Floor"


async def test_import_is_idempotent(factory, db_session):
    company = await factory.company()
    site = await factory.site(company)
    await db_session.commit()

    await import_rows(db_session, company.id, site.id, _rows())
    await db_session.commit()
    stats2 = await import_rows(db_session, company.id, site.id, _rows())  # second run
    await db_session.commit()

    assert stats2.specs == 0  # nothing new on re-run
    assert (await db_session.scalar(select(func.count()).select_from(Spec))) == 3
    assert (await db_session.scalar(select(func.count()).select_from(Space))) == 2
    assert (await db_session.scalar(select(func.count()).select_from(Material))) == 3
