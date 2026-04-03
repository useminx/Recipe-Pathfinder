from recipe_pathfinder_backend.indexer import build_output_index
from recipe_pathfinder_backend.models import MaterialKey, RecipeIO, RecipeRecord
from recipe_pathfinder_backend.solver import SearchConfig, solve_target


def test_solver_marks_cycle_detected_on_two_recipe_loop():
    material_a = MaterialKey(kind="item", id="mod:a", canonical_id="mod:a")
    material_b = MaterialKey(kind="item", id="mod:b", canonical_id="mod:b")
    recipe_a = RecipeRecord(
        recipe_id="make_a",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=material_b, amount=1),),
        outputs=(RecipeIO(material=material_a, amount=1),),
        raw_ref={},
    )
    recipe_b = RecipeRecord(
        recipe_id="make_b",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=material_a, amount=1),),
        outputs=(RecipeIO(material=material_b, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        material_a,
        1,
        build_output_index([recipe_a, recipe_b]),
        SearchConfig(max_depth=8),
    )

    blocked_need = result["trees"][0]["children"][0]["children"][0]

    assert result["summary"]["tree_count"] == 1
    assert result["trees"][0]["status_reasons"] == ["no_recipe"]
    assert blocked_need["material"] == material_b.canonical_id
    assert blocked_need["status"] == "no_recipe"


def test_solver_prunes_cycle_branch_into_no_recipe_leaf():
    target = MaterialKey(kind="item", id="mod:coal", canonical_id="mod:coal")
    raw_coal = MaterialKey(kind="item", id="mod:raw_coal", canonical_id="mod:raw_coal")
    raw_coal_block = MaterialKey(
        kind="item",
        id="mod:raw_coal_block",
        canonical_id="mod:raw_coal_block",
    )

    cycle_entry = RecipeRecord(
        recipe_id="coal_from_raw",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=raw_coal, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    decompress = RecipeRecord(
        recipe_id="raw_from_block",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=raw_coal_block, amount=1),),
        outputs=(RecipeIO(material=raw_coal, amount=1),),
        raw_ref={},
    )
    recompress = RecipeRecord(
        recipe_id="block_from_raw",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=raw_coal, amount=1),),
        outputs=(RecipeIO(material=raw_coal_block, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([cycle_entry, decompress, recompress]),
        SearchConfig(max_trees=5),
    )

    raw_need = result["trees"][0]["children"][0]["children"][0]
    block_need = raw_need["children"][0]["children"][0]

    assert result["summary"]["tree_count"] == 1
    assert result["trees"][0]["status_reasons"] == ["no_recipe"]
    assert raw_need["material"] == raw_coal.canonical_id
    assert block_need["material"] == raw_coal_block.canonical_id
    assert block_need["status"] == "no_recipe"
