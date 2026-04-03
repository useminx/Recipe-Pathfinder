from pathlib import Path

from recipe_pathfinder_backend.aliases import AliasMap, build_namespace_aliases
from recipe_pathfinder_backend.loader import discover_json_files, load_recipe_documents


def test_discover_json_files_reads_single_file():
    fixture = Path(__file__).parent / "fixtures" / "sample_recipes.json"

    discovered = discover_json_files([fixture])

    assert discovered == [fixture]


def test_load_recipe_documents_reads_json_array():
    fixture = Path(__file__).parent / "fixtures" / "sample_recipes.json"

    documents = load_recipe_documents([fixture])

    assert len(documents) == 1
    assert documents[0][0]["id"] == "gtceu:assembler/example_output"


def test_load_recipe_documents_accepts_utf8_bom(tmp_path):
    fixture = tmp_path / "bom.json"
    fixture.write_bytes(
        b"\xef\xbb\xbf"
        + b'[{"id":"mod:bom_recipe","type":"Recipe","inputs":[],"outputs":[]}]'
    )

    documents = load_recipe_documents([fixture])

    assert documents[0][0]["id"] == "mod:bom_recipe"


def test_discover_json_files_deduplicates_overlapping_inputs(tmp_path):
    nested = tmp_path / "nested"
    nested.mkdir()
    fixture = nested / "sample.json"
    fixture.write_text("[]", encoding="utf-8")

    discovered = discover_json_files([tmp_path, fixture])

    assert discovered == [fixture]


def test_discover_json_files_rejects_missing_path(tmp_path):
    missing = tmp_path / "missing.json"

    try:
        discover_json_files([missing])
    except FileNotFoundError as exc:
        assert str(missing) in str(exc)
    else:
        raise AssertionError("expected FileNotFoundError")


def test_alias_map_applies_explicit_mapping_only():
    aliases = AliasMap({"forge:oxygen": "gtceu:oxygen"})

    assert aliases.normalize("forge:oxygen") == "gtceu:oxygen"
    assert aliases.normalize("minecraft:water") == "minecraft:water"


def test_build_namespace_aliases_maps_ad_astra_counterparts_to_gtceu_when_suffix_matches():
    documents = [
        [
            {
                "id": "mod:one",
                "type": "Recipe",
                "inputs": [{"item": "ad_astra:steel_ingot", "type": "item", "count": 1}],
                "outputs": [{"item": "ad_astra:steel_rod", "type": "item", "count": 1}],
            },
            {
                "id": "mod:two",
                "type": "Recipe",
                "inputs": [{"item": "gtceu:steel_rod", "type": "item", "count": 1}],
                "outputs": [{"item": "gtceu:steel_ingot", "type": "item", "count": 1}],
            },
        ]
    ]

    aliases = build_namespace_aliases(documents)

    assert aliases.normalize("ad_astra:steel_ingot") == "gtceu:steel_ingot"
    assert aliases.normalize("ad_astra:steel_rod") == "gtceu:steel_rod"


def test_build_namespace_aliases_maps_missing_gtceu_counterparts_back_to_existing_ad_astra_ids():
    documents = [
        [
            {
                "id": "mod:one",
                "type": "Recipe",
                "inputs": [{"item": "ad_astra:steel_ingot", "type": "item", "count": 1}],
                "outputs": [{"item": "ad_astra:steel_rod", "type": "item", "count": 1}],
            }
        ]
    ]

    aliases = build_namespace_aliases(documents)

    assert aliases.normalize("gtceu:steel_ingot") == "ad_astra:steel_ingot"
    assert aliases.normalize("gtceu:steel_rod") == "ad_astra:steel_rod"
