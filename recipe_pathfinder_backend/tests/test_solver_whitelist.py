from recipe_pathfinder_backend.indexer import build_output_index
from recipe_pathfinder_backend.models import MaterialKey, RecipeIO, RecipeRecord
from recipe_pathfinder_backend.solver import SearchConfig, solve_target


def _record(recipe_id: str, output: MaterialKey, *inputs: MaterialKey) -> RecipeRecord:
    return RecipeRecord(
        recipe_id=recipe_id,
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=tuple(RecipeIO(material=material, amount=1) for material in inputs),
        outputs=(RecipeIO(material=output, amount=1),),
        raw_ref={},
    )


def test_solver_keeps_tree_only_when_all_whitelist_ids_appear():
    target = MaterialKey(kind="item", id="mod:target", canonical_id="mod:target")
    required_a = MaterialKey(kind="item", id="mod:req_a", canonical_id="mod:req_a")
    required_b = MaterialKey(kind="fluid", id="mod:req_b", canonical_id="mod:req_b")
    base = MaterialKey(kind="item", id="mod:base", canonical_id="mod:base")

    keep = _record("keep", target, required_a, required_b)
    drop = _record("drop", target, required_a, base)

    result = solve_target(
        target,
        1,
        build_output_index([keep, drop]),
        SearchConfig(whitelist=frozenset({"mod:req_a", "mod:req_b"}), max_trees=5),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == ["keep"]
    assert result["summary"]["tree_count"] == 1


def test_solver_applies_whitelist_before_final_max_trees_truncation():
    target = MaterialKey(kind="item", id="mod:target_ranked", canonical_id="mod:target_ranked")
    required = MaterialKey(kind="item", id="mod:required", canonical_id="mod:required")
    filler = MaterialKey(kind="item", id="mod:filler", canonical_id="mod:filler")

    filtered_out = _record("filtered_out", target, filler)
    kept = _record("kept", target, required)

    result = solve_target(
        target,
        1,
        build_output_index([filtered_out, kept]),
        SearchConfig(whitelist=frozenset({"mod:required"}), max_trees=1),
    )

    assert result["summary"]["tree_count"] == 1
    assert len(result["trees"]) == 1
    assert result["trees"][0]["children"][0]["recipe_id"] == "kept"


def test_solver_returns_empty_result_when_whitelist_filters_everything():
    target = MaterialKey(kind="item", id="mod:target_empty", canonical_id="mod:target_empty")
    available = MaterialKey(kind="item", id="mod:available", canonical_id="mod:available")
    missing = MaterialKey(kind="item", id="mod:missing", canonical_id="mod:missing")

    only_tree = _record("only_tree", target, available)

    result = solve_target(
        target,
        1,
        build_output_index([only_tree]),
        SearchConfig(
            available_materials=frozenset({available.canonical_id}),
            whitelist=frozenset({missing.canonical_id}),
            max_trees=5,
        ),
    )

    assert result["trees"] == []
    assert result["summary"]["tree_count"] == 0
    assert result["summary"]["fully_resolved_count"] == 0
    assert result["summary"]["partially_resolved_count"] == 0
