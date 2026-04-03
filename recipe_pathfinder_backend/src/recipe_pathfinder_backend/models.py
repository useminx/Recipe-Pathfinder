from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class MaterialKey:
    kind: str
    id: str
    canonical_id: str | None = None


@dataclass(frozen=True)
class RecipeIO:
    material: MaterialKey
    amount: int
    chance: int | None = None
    raw_type: str = ""
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class RecipeRecord:
    recipe_id: str
    source_namespace: str
    recipe_class: str
    machine_type: str
    duration: int
    eut: int | None
    inputs: tuple[RecipeIO, ...]
    outputs: tuple[RecipeIO, ...]
    raw_ref: dict[str, Any] = field(default_factory=dict)
