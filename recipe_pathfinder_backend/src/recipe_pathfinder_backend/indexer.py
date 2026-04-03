from __future__ import annotations

from recipe_pathfinder_backend.models import RecipeRecord


def output_lookup_key(kind: str, canonical_id: str) -> str:
    return f"{kind}:{canonical_id}"


def build_output_index(recipes: list[RecipeRecord]) -> dict[str, list[RecipeRecord]]:
    index: dict[str, list[RecipeRecord]] = {}
    for recipe in recipes:
        seen_keys: set[str] = set()
        for output in recipe.outputs:
            if output.chance is not None:
                continue
            canonical_id = output.material.canonical_id or output.material.id
            key = output_lookup_key(output.material.kind, canonical_id)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            index.setdefault(key, []).append(recipe)
    return index
