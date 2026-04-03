from __future__ import annotations

from typing import Any

from recipe_pathfinder_backend.aliases import AliasMap
from recipe_pathfinder_backend.models import MaterialKey, RecipeIO, RecipeRecord


def _normalize_entry(entry: dict[str, Any], aliases: AliasMap) -> RecipeIO | None:
    raw_type = str(entry.get("type", "item" if "item" in entry else "fluid" if "fluid" in entry else ""))
    if raw_type == "item" or "item" in entry:
        material_id = str(entry.get("item", ""))
        if not material_id:
            return None
        amount = int(entry.get("count", 1))
        chance = entry.get("chance")
        extra = {key: value for key, value in entry.items() if key not in {"item", "type", "count"}}
        return RecipeIO(
            material=MaterialKey(kind="item", id=material_id, canonical_id=aliases.normalize(material_id)),
            amount=amount,
            chance=chance,
            raw_type=str(entry.get("type", "item")),
            extra=extra,
        )
    if raw_type == "fluid" or "fluid" in entry:
        material_id = str(entry.get("fluid", ""))
        if not material_id:
            return None
        amount = int(entry.get("amount", 0))
        chance = entry.get("chance")
        extra = {key: value for key, value in entry.items() if key not in {"fluid", "type", "amount"}}
        return RecipeIO(
            material=MaterialKey(kind="fluid", id=material_id, canonical_id=aliases.normalize(material_id)),
            amount=amount,
            chance=chance,
            raw_type=str(entry.get("type", "fluid")),
            extra=extra,
        )
    return None


def normalize_documents(documents: list[list[dict[str, Any]]], aliases: AliasMap) -> list[RecipeRecord]:
    records: list[RecipeRecord] = []
    for document in documents:
        for entry in document:
            inputs = tuple(
                normalized
                for normalized in (_normalize_entry(item, aliases) for item in entry.get("inputs", []))
                if normalized is not None
            )
            outputs = tuple(
                normalized
                for normalized in (_normalize_entry(item, aliases) for item in entry.get("outputs", []))
                if normalized is not None
            )
            records.append(
                RecipeRecord(
                    recipe_id=str(entry.get("id", "")),
                    source_namespace=str(entry.get("namespace", "")),
                    recipe_class=str(entry.get("type", "")),
                    machine_type=str(entry.get("recipeType", entry.get("type", ""))),
                    duration=int(entry.get("duration", 0)),
                    eut=entry.get("EUt"),
                    inputs=inputs,
                    outputs=outputs,
                    raw_ref={"id": entry.get("id", "")},
                )
            )
    return records
