from __future__ import annotations

from typing import Any


class AliasMap:
    def __init__(self, mapping: dict[str, str] | None = None) -> None:
        self._mapping = dict(mapping or {})

    def normalize(self, material_id: str) -> str:
        return self._mapping.get(material_id, material_id)


def build_namespace_aliases(documents: list[list[dict[str, Any]]]) -> AliasMap:
    material_ids: set[str] = set()
    for document in documents:
        for recipe in document:
            for entry in recipe.get("inputs", []):
                _collect_material_id(entry, material_ids)
            for entry in recipe.get("outputs", []):
                _collect_material_id(entry, material_ids)

    mapping: dict[str, str] = {}
    alias_namespaces = ("gtceu", "ad_astra", "forge")
    preferred_canonical_order = ("gtceu", "ad_astra", "forge")
    suffix_to_namespaces: dict[str, set[str]] = {}

    for material_id in material_ids:
        namespace, _, suffix = material_id.partition(":")
        if namespace not in alias_namespaces or not suffix:
            continue
        suffix_to_namespaces.setdefault(suffix, set()).add(namespace)

    for suffix, namespaces in suffix_to_namespaces.items():
        canonical_namespace = next(
            (namespace for namespace in preferred_canonical_order if namespace in namespaces),
            None,
        )
        if canonical_namespace is None:
            continue
        canonical_id = f"{canonical_namespace}:{suffix}"
        for namespace in alias_namespaces:
            candidate_id = f"{namespace}:{suffix}"
            if candidate_id == canonical_id:
                continue
            mapping[candidate_id] = canonical_id

    return AliasMap(mapping)


def _collect_material_id(entry: dict[str, Any], material_ids: set[str]) -> None:
    item_id = entry.get("item")
    if isinstance(item_id, str) and item_id:
        material_ids.add(item_id)

    fluid_id = entry.get("fluid")
    if isinstance(fluid_id, str) and fluid_id:
        material_ids.add(fluid_id)
