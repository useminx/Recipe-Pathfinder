from recipe_pathfinder_backend.aliases import AliasMap
from recipe_pathfinder_backend.indexer import build_output_index, output_lookup_key
from recipe_pathfinder_backend.normalizer import normalize_documents


def test_normalize_documents_extracts_item_and_fluid_amounts():
    documents = [
        [
            {
                "id": "gtceu:assembler/example_output",
                "namespace": "gtceu",
                "type": "Recipe",
                "recipeType": "assembler",
                "duration": 20,
                "EUt": 8,
                "inputs": [
                    {
                        "item": "forge:iron_ingot",
                        "type": "item",
                        "count": 2,
                        "capability": "ItemRecipe",
                    },
                    {
                        "fluid": "forge:water",
                        "type": "fluid",
                        "amount": 1000,
                        "capability": "FluidRecipe",
                    },
                ],
                "outputs": [
                    {
                        "item": "minecraft:bucket",
                        "type": "item",
                        "count": 1,
                        "capability": "ItemRecipe",
                    }
                ],
            }
        ]
    ]
    aliases = AliasMap(
        {
            "forge:iron_ingot": "minecraft:iron_ingot",
            "forge:water": "minecraft:water",
        }
    )

    records = normalize_documents(documents, aliases)

    assert len(records) == 1
    record = records[0]
    assert record.duration == 20
    assert record.eut == 8
    assert record.source_namespace == "gtceu"
    assert record.recipe_class == "Recipe"
    assert record.machine_type == "assembler"
    assert record.raw_ref == {"id": "gtceu:assembler/example_output"}
    assert record.inputs[0].amount == 2
    assert record.inputs[0].chance is None
    assert record.inputs[0].material.canonical_id == "minecraft:iron_ingot"
    assert record.inputs[0].extra == {"capability": "ItemRecipe"}
    assert record.inputs[1].amount == 1000
    assert record.inputs[1].chance is None
    assert record.inputs[1].material.canonical_id == "minecraft:water"
    assert record.inputs[1].extra == {"capability": "FluidRecipe"}
    assert record.outputs[0].amount == 1
    assert record.outputs[0].material.canonical_id == "minecraft:bucket"


def test_normalize_documents_populates_chance_for_item_and_fluid_entries():
    documents = [
        [
            {
                "id": "gtceu:assembler/example_output",
                "type": "Recipe",
                "inputs": [
                    {
                        "item": "forge:iron_ingot",
                        "type": "item",
                        "count": 2,
                        "chance": 0.5,
                    },
                    {
                        "fluid": "forge:water",
                        "type": "fluid",
                        "amount": 1000,
                        "chance": 0.25,
                    },
                ],
                "outputs": [],
            }
        ]
    ]

    record = normalize_documents(documents, AliasMap())[0]

    assert record.inputs[0].chance == 0.5
    assert record.inputs[1].chance == 0.25


def test_build_output_index_maps_produced_material_to_recipe():
    documents = [
        [
            {
                "id": "gtceu:assembler/example_output",
                "namespace": "gtceu",
                "type": "Recipe",
                "recipeType": "assembler",
                "outputs": [
                    {
                        "item": "minecraft:bucket",
                        "type": "item",
                        "count": 1,
                    }
                ],
            }
        ]
    ]

    records = normalize_documents(documents, AliasMap())
    index = build_output_index(records)

    assert output_lookup_key("item", "minecraft:bucket") in index
    assert index[output_lookup_key("item", "minecraft:bucket")] == [records[0]]


def test_build_output_index_deduplicates_recipe_per_output_key():
    documents = [
        [
            {
                "id": "gtceu:assembler/example_output",
                "namespace": "gtceu",
                "type": "Recipe",
                "recipeType": "assembler",
                "outputs": [
                    {
                        "item": "forge:bucket",
                        "type": "item",
                        "count": 1,
                    },
                    {
                        "item": "minecraft:bucket",
                        "type": "item",
                        "count": 1,
                    },
                ],
            }
        ]
    ]
    aliases = AliasMap({"forge:bucket": "minecraft:bucket"})

    records = normalize_documents(documents, aliases)
    index = build_output_index(records)

    assert index[output_lookup_key("item", "minecraft:bucket")] == [records[0]]


def test_build_output_index_ignores_probabilistic_outputs():
    documents = [
        [
            {
                "id": "gtceu:assembler/example_output",
                "namespace": "gtceu",
                "type": "Recipe",
                "recipeType": "assembler",
                "outputs": [
                    {
                        "item": "minecraft:bucket",
                        "type": "item",
                        "count": 1,
                        "chance": 0.25,
                    }
                ],
            }
        ]
    ]

    records = normalize_documents(documents, AliasMap())
    index = build_output_index(records)

    assert output_lookup_key("item", "minecraft:bucket") not in index
