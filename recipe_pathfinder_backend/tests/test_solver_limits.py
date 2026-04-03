from recipe_pathfinder_backend.indexer import build_output_index
from recipe_pathfinder_backend.models import MaterialKey, RecipeIO, RecipeRecord
from recipe_pathfinder_backend.solver import SearchConfig, solve_target
import recipe_pathfinder_backend.solver as solver_module


def test_solver_marks_no_recipe_when_output_index_is_empty():
    target = MaterialKey(kind="item", id="mod:target", canonical_id="mod:target")

    result = solve_target(target, 1, {}, SearchConfig())

    assert result["trees"][0]["status"] == "partially_resolved"
    assert result["trees"][0]["status_reasons"] == ["no_recipe"]


def test_solver_prefers_available_materials_over_blacklist():
    target = MaterialKey(kind="item", id="mod:target", canonical_id="mod:target")

    result = solve_target(
        target,
        1,
        {},
        SearchConfig(
            available_materials=frozenset({"mod:target"}),
            blacklist=frozenset({"mod:target"}),
        ),
    )

    assert result["trees"][0]["status"] == "fully_resolved"
    assert result["trees"][0]["status_reasons"] == []
    assert result["summary"]["fully_resolved_count"] == 1
    assert result["summary"]["blacklist_cut_count"] == 0


def test_solver_stops_expansion_when_max_nodes_budget_is_exhausted():
    material_a = MaterialKey(kind="item", id="mod:a", canonical_id="mod:a")
    material_b = MaterialKey(kind="item", id="mod:b", canonical_id="mod:b")
    material_c = MaterialKey(kind="item", id="mod:c", canonical_id="mod:c")
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
        inputs=(RecipeIO(material=material_c, amount=1),),
        outputs=(RecipeIO(material=material_b, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        material_a,
        1,
        build_output_index([recipe_a, recipe_b]),
        SearchConfig(max_nodes_per_tree=3),
    )

    limited_child = result["trees"][0]["children"][0]["children"][0]

    assert limited_child["status"] == "max_nodes_reached"
    assert result["trees"][0]["status_reasons"] == ["max_nodes_reached"]


def test_solver_limits_top_level_trees_with_max_trees():
    target = MaterialKey(kind="item", id="mod:target", canonical_id="mod:target")
    input_a = MaterialKey(kind="item", id="mod:input_a", canonical_id="mod:input_a")
    input_b = MaterialKey(kind="item", id="mod:input_b", canonical_id="mod:input_b")
    recipe_a = RecipeRecord(
        recipe_id="make_target_a",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=input_a, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    recipe_b = RecipeRecord(
        recipe_id="make_target_b",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=input_b, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([recipe_a, recipe_b]),
        SearchConfig(max_trees=1),
    )

    assert result["summary"]["tree_count"] == 1
    assert len(result["trees"]) == 1
    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == ["make_target_a"]

    expanded_result = solve_target(
        target,
        1,
        build_output_index([recipe_a, recipe_b]),
        SearchConfig(max_trees=2),
    )

    assert expanded_result["summary"]["tree_count"] == 2
    assert [tree["children"][0]["recipe_id"] for tree in expanded_result["trees"]] == [
        "make_target_a",
        "make_target_b",
    ]


def test_solver_drops_trees_that_never_match_selected_source_materials():
    target = MaterialKey(kind="fluid", id="mod:target", canonical_id="mod:target")
    selected = MaterialKey(kind="fluid", id="mod:selected", canonical_id="mod:selected")
    missing = MaterialKey(kind="fluid", id="mod:missing", canonical_id="mod:missing")
    unrelated_a = MaterialKey(kind="fluid", id="mod:unrelated_a", canonical_id="mod:unrelated_a")
    unrelated_b = MaterialKey(kind="fluid", id="mod:unrelated_b", canonical_id="mod:unrelated_b")

    relevant = RecipeRecord(
        recipe_id="relevant_route",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=20,
        eut=8,
        inputs=(
            RecipeIO(material=selected, amount=1),
            RecipeIO(material=missing, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    unrelated = RecipeRecord(
        recipe_id="unrelated_route",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=4,
        inputs=(
            RecipeIO(material=unrelated_a, amount=1),
            RecipeIO(material=unrelated_b, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([relevant, unrelated]),
        SearchConfig(available_materials=frozenset({"mod:selected"}), max_trees=5),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == ["relevant_route"]
    assert result["summary"]["tree_count"] == 1


def test_solver_requires_every_selected_source_material_to_appear_in_the_tree():
    target = MaterialKey(kind="fluid", id="mod:target_all_sources", canonical_id="mod:target_all_sources")
    selected_a = MaterialKey(kind="fluid", id="mod:selected_a", canonical_id="mod:selected_a")
    selected_b = MaterialKey(kind="fluid", id="mod:selected_b", canonical_id="mod:selected_b")
    missing = MaterialKey(kind="fluid", id="mod:missing_all_sources", canonical_id="mod:missing_all_sources")

    keep = RecipeRecord(
        recipe_id="keep_all_sources",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=20,
        eut=8,
        inputs=(
            RecipeIO(material=selected_a, amount=1),
            RecipeIO(material=selected_b, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    drop = RecipeRecord(
        recipe_id="drop_partial_sources",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=4,
        inputs=(
            RecipeIO(material=selected_a, amount=1),
            RecipeIO(material=missing, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([keep, drop]),
        SearchConfig(
            available_materials=frozenset({"mod:selected_a", "mod:selected_b"}),
            max_trees=5,
        ),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == ["keep_all_sources"]
    assert result["summary"]["tree_count"] == 1


def test_solver_stops_at_recipe_frontier_once_any_selected_source_is_used():
    target = MaterialKey(kind="fluid", id="mod:target_frontier", canonical_id="mod:target_frontier")
    selected = MaterialKey(kind="fluid", id="mod:selected_frontier", canonical_id="mod:selected_frontier")
    missing = MaterialKey(kind="fluid", id="mod:missing_frontier", canonical_id="mod:missing_frontier")
    deep = MaterialKey(kind="fluid", id="mod:deep_frontier", canonical_id="mod:deep_frontier")

    root_recipe = RecipeRecord(
        recipe_id="frontier_root",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=20,
        eut=8,
        inputs=(
            RecipeIO(material=selected, amount=1),
            RecipeIO(material=missing, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    deep_recipe = RecipeRecord(
        recipe_id="frontier_deep",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=4,
        inputs=(RecipeIO(material=deep, amount=1),),
        outputs=(RecipeIO(material=missing, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([root_recipe, deep_recipe]),
        SearchConfig(available_materials=frozenset({"mod:selected_frontier"}), max_trees=5),
    )

    recipe_children = result["trees"][0]["children"][0]["children"]
    assert [child["status"] for child in recipe_children] == ["source_matched", "no_recipe"]
    assert recipe_children[1]["children"] == []


def test_solver_prunes_subtrees_that_match_neither_sources_nor_whitelist():
    target = MaterialKey(kind="fluid", id="mod:target_prune", canonical_id="mod:target_prune")
    methanol = MaterialKey(kind="fluid", id="mod:methanol_prune", canonical_id="mod:methanol_prune")
    ammonia = MaterialKey(kind="fluid", id="mod:ammonia_prune", canonical_id="mod:ammonia_prune")
    acid = MaterialKey(kind="fluid", id="mod:acid_prune", canonical_id="mod:acid_prune")
    hydrogen = MaterialKey(kind="fluid", id="mod:hydrogen_prune", canonical_id="mod:hydrogen_prune")
    oxygen = MaterialKey(kind="fluid", id="mod:oxygen_prune", canonical_id="mod:oxygen_prune")
    coal_gas = MaterialKey(kind="fluid", id="mod:coal_gas_prune", canonical_id="mod:coal_gas_prune")

    root_recipe = RecipeRecord(
        recipe_id="root_prune",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=20,
        eut=8,
        inputs=(
            RecipeIO(material=methanol, amount=1),
            RecipeIO(material=ammonia, amount=1),
            RecipeIO(material=acid, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    methanol_recipe = RecipeRecord(
        recipe_id="methanol_prune_recipe",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=4,
        inputs=(
            RecipeIO(material=hydrogen, amount=1),
            RecipeIO(material=oxygen, amount=1),
        ),
        outputs=(RecipeIO(material=methanol, amount=1),),
        raw_ref={},
    )
    ammonia_recipe = RecipeRecord(
        recipe_id="ammonia_prune_recipe",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=4,
        inputs=(RecipeIO(material=coal_gas, amount=1),),
        outputs=(RecipeIO(material=ammonia, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([root_recipe, methanol_recipe, ammonia_recipe]),
        SearchConfig(
            available_materials=frozenset({"mod:hydrogen_prune"}),
            whitelist=frozenset({"mod:oxygen_prune"}),
            max_trees=5,
        ),
    )

    root_children = result["trees"][0]["children"][0]["children"]
    assert [child["material"] for child in root_children] == [
        "mod:methanol_prune",
        "mod:ammonia_prune",
        "mod:acid_prune",
    ]
    assert root_children[0]["status"] == "expanded"
    assert root_children[1]["status"] == "no_recipe"
    assert root_children[1]["children"] == []


def test_solver_does_not_treat_whitelist_as_a_subtree_frontier_signal():
    target = MaterialKey(kind="fluid", id="mod:target_whitelist_split", canonical_id="mod:target_whitelist_split")
    hydrogen_branch = MaterialKey(
        kind="fluid",
        id="mod:hydrogen_branch",
        canonical_id="mod:hydrogen_branch",
    )
    oxygen_branch = MaterialKey(
        kind="fluid",
        id="mod:oxygen_branch",
        canonical_id="mod:oxygen_branch",
    )
    hydrogen = MaterialKey(kind="fluid", id="mod:hydrogen_split", canonical_id="mod:hydrogen_split")
    oxygen = MaterialKey(kind="fluid", id="mod:oxygen_split", canonical_id="mod:oxygen_split")
    unrelated = MaterialKey(kind="fluid", id="mod:unrelated_split", canonical_id="mod:unrelated_split")

    root_recipe = RecipeRecord(
        recipe_id="root_whitelist_split",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=20,
        eut=8,
        inputs=(
            RecipeIO(material=hydrogen_branch, amount=1),
            RecipeIO(material=oxygen_branch, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    hydrogen_recipe = RecipeRecord(
        recipe_id="hydrogen_branch_recipe",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=4,
        inputs=(RecipeIO(material=hydrogen, amount=1),),
        outputs=(RecipeIO(material=hydrogen_branch, amount=1),),
        raw_ref={},
    )
    oxygen_recipe = RecipeRecord(
        recipe_id="oxygen_branch_recipe",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=4,
        inputs=(
            RecipeIO(material=oxygen, amount=1),
            RecipeIO(material=unrelated, amount=1),
        ),
        outputs=(RecipeIO(material=oxygen_branch, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([root_recipe, hydrogen_recipe, oxygen_recipe]),
        SearchConfig(
            available_materials=frozenset({"mod:hydrogen_split"}),
            whitelist=frozenset({"mod:oxygen_split"}),
            max_trees=5,
        ),
    )

    assert result["trees"] == []
    assert result["summary"]["tree_count"] == 0


def test_solver_keeps_surplus_isolated_between_top_level_alternatives():
    target = MaterialKey(kind="item", id="mod:target", canonical_id="mod:target")
    shared = MaterialKey(kind="item", id="mod:shared", canonical_id="mod:shared")
    base = MaterialKey(kind="item", id="mod:base", canonical_id="mod:base")

    recipe_with_surplus = RecipeRecord(
        recipe_id="make_target_with_surplus",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=target, amount=1),
            RecipeIO(material=shared, amount=1),
        ),
        raw_ref={},
    )
    recipe_needing_shared = RecipeRecord(
        recipe_id="make_target_needing_shared",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(
            RecipeIO(material=base, amount=1),
            RecipeIO(material=shared, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([recipe_with_surplus, recipe_needing_shared]),
        SearchConfig(enable_surplus_reuse=True, max_trees=2),
    )

    second_tree_shared_need = result["trees"][1]["children"][0]["children"][1]

    assert result["trees"][0]["children"][0]["recipe_id"] == "make_target_with_surplus"
    assert second_tree_shared_need["status"] == "expanded"


def test_solver_never_reuses_probabilistic_outputs_as_surplus():
    target = MaterialKey(kind="item", id="mod:target_prob", canonical_id="mod:target_prob")
    choice = MaterialKey(kind="item", id="mod:choice_prob", canonical_id="mod:choice_prob")
    shared = MaterialKey(kind="item", id="mod:shared_prob", canonical_id="mod:shared_prob")
    base = MaterialKey(kind="item", id="mod:base_prob", canonical_id="mod:base_prob")

    recipe_target = RecipeRecord(
        recipe_id="make_target_prob",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(
            RecipeIO(material=choice, amount=1),
            RecipeIO(material=shared, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    recipe_choice = RecipeRecord(
        recipe_id="make_choice_prob",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=choice, amount=1),
            RecipeIO(material=shared, amount=1, chance=0.5),
        ),
        raw_ref={},
    )
    recipe_shared = RecipeRecord(
        recipe_id="make_shared_prob",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(RecipeIO(material=shared, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([recipe_target, recipe_choice, recipe_shared]),
        SearchConfig(enable_surplus_reuse=True),
    )

    shared_need = result["trees"][0]["children"][0]["children"][1]

    assert shared_need["status"] == "expanded"


def test_solver_sorts_fully_resolved_trees_before_partially_resolved_ones():
    target = MaterialKey(kind="item", id="mod:target_sort", canonical_id="mod:target_sort")
    available = MaterialKey(kind="item", id="mod:available_sort", canonical_id="mod:available_sort")
    missing = MaterialKey(kind="item", id="mod:missing_sort", canonical_id="mod:missing_sort")

    partial_recipe = RecipeRecord(
        recipe_id="make_target_partial_sort",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(
            RecipeIO(material=available, amount=1),
            RecipeIO(material=missing, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    full_recipe = RecipeRecord(
        recipe_id="make_target_full_sort",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=1,
        inputs=(RecipeIO(material=available, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([partial_recipe, full_recipe]),
        SearchConfig(
            available_materials=frozenset({available.canonical_id}),
            max_trees=2,
        ),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == [
        "make_target_full_sort",
        "make_target_partial_sort",
    ]
    assert result["trees"][0]["status"] == "fully_resolved"
    assert result["trees"][1]["status"] == "partially_resolved"
    assert result["trees"][0]["metrics"]["failure_count"] == 0
    assert result["trees"][1]["metrics"]["failure_count"] > 0


def test_solver_applies_max_trees_after_ranking():
    target = MaterialKey(kind="item", id="mod:target_rank", canonical_id="mod:target_rank")
    available = MaterialKey(kind="item", id="mod:available_rank", canonical_id="mod:available_rank")
    missing = MaterialKey(kind="item", id="mod:missing_rank", canonical_id="mod:missing_rank")

    partial_recipe = RecipeRecord(
        recipe_id="make_target_partial_rank",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=1,
        inputs=(RecipeIO(material=missing, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    full_recipe = RecipeRecord(
        recipe_id="make_target_full_rank",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=1,
        inputs=(RecipeIO(material=available, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([partial_recipe, full_recipe]),
        SearchConfig(
            available_materials=frozenset({available.canonical_id}),
            max_trees=1,
        ),
    )

    assert result["summary"]["tree_count"] == 1
    assert len(result["trees"]) == 1
    assert result["trees"][0]["children"][0]["recipe_id"] == "make_target_full_rank"
    assert result["trees"][0]["status"] == "fully_resolved"


def test_solver_stops_collecting_after_max_trees_when_whitelist_is_empty(monkeypatch):
    target = MaterialKey(kind="item", id="mod:target_fast_path", canonical_id="mod:target_fast_path")
    generated_recipe_ids: list[str] = []

    def fake_generate_expansions(*args, **kwargs):
        for index in range(5):
            recipe_id = f"recipe_{index}"
            generated_recipe_ids.append(recipe_id)
            yield (
                {
                    "node_type": "material_need",
                    "material": target.canonical_id,
                    "required_amount": 1,
                    "status": "expanded",
                    "children": [
                        {
                            "node_type": "recipe_choice",
                            "recipe_id": recipe_id,
                            "recipe_type": "Recipe",
                            "machine_type": "machine",
                            "duration": index + 1,
                            "eut": 1,
                            "runs": 1,
                            "primary_output": target.canonical_id,
                            "surplus": 0,
                            "inputs": [],
                            "outputs": [{"material": target.canonical_id, "amount": 1}],
                            "children": [
                                {
                                    "node_type": "material_need",
                                    "material": f"mod:source_{index}",
                                    "required_amount": 1,
                                    "status": "source_matched",
                                    "children": [],
                                }
                            ],
                        }
                    ],
                },
                0,
                None,
            )

    monkeypatch.setattr(solver_module, "_generate_expansions", fake_generate_expansions)

    result = solve_target(target, 1, {}, SearchConfig(max_trees=2, max_branching_per_material=2))

    assert generated_recipe_ids == ["recipe_0", "recipe_1"]
    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == ["recipe_0", "recipe_1"]


def test_solver_keeps_whitelist_search_bounded(monkeypatch):
    target = MaterialKey(kind="item", id="mod:target_whitelist_budget", canonical_id="mod:target_whitelist_budget")
    required = "mod:required_whitelist_budget"
    generated_recipe_ids: list[str] = []

    def fake_generate_expansions(*args, **kwargs):
        for index in range(10):
            recipe_id = f"recipe_{index}"
            generated_recipe_ids.append(recipe_id)
            matched_material = required if index == 2 else f"mod:other_{index}"
            yield (
                {
                    "node_type": "material_need",
                    "material": target.canonical_id,
                    "required_amount": 1,
                    "status": "expanded",
                    "children": [
                        {
                            "node_type": "recipe_choice",
                            "recipe_id": recipe_id,
                            "recipe_type": "Recipe",
                            "machine_type": "machine",
                            "duration": index + 1,
                            "eut": 1,
                            "runs": 1,
                            "primary_output": target.canonical_id,
                            "surplus": 0,
                            "inputs": [{"material": matched_material, "amount": 1}],
                            "outputs": [{"material": target.canonical_id, "amount": 1}],
                            "children": [
                                {
                                    "node_type": "material_need",
                                    "material": matched_material,
                                    "required_amount": 1,
                                    "status": "source_matched",
                                    "children": [],
                                }
                            ],
                        }
                    ],
                },
                0,
                None,
            )

    monkeypatch.setattr(solver_module, "_generate_expansions", fake_generate_expansions)

    result = solve_target(
        target,
        1,
        {},
        SearchConfig(
            whitelist=frozenset({required}),
            max_trees=1,
            max_branching_per_material=2,
        ),
    )

    assert len(generated_recipe_ids) == 2
    assert result["trees"] == []


def test_solver_sorts_by_step_count_then_total_eut_then_duration():
    target = MaterialKey(kind="item", id="mod:target_steps", canonical_id="mod:target_steps")
    direct_a = MaterialKey(kind="item", id="mod:direct_a", canonical_id="mod:direct_a")
    direct_b = MaterialKey(kind="item", id="mod:direct_b", canonical_id="mod:direct_b")
    direct_c = MaterialKey(kind="item", id="mod:direct_c", canonical_id="mod:direct_c")
    intermediate = MaterialKey(kind="item", id="mod:intermediate_steps", canonical_id="mod:intermediate_steps")
    base = MaterialKey(kind="item", id="mod:base_steps", canonical_id="mod:base_steps")

    deep_recipe = RecipeRecord(
        recipe_id="make_target_deep",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=2,
        eut=1,
        inputs=(RecipeIO(material=intermediate, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    intermediate_recipe = RecipeRecord(
        recipe_id="make_intermediate_steps",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=8,
        eut=1,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(RecipeIO(material=intermediate, amount=1),),
        raw_ref={},
    )
    slow_recipe = RecipeRecord(
        recipe_id="make_target_slow",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=1,
        inputs=(RecipeIO(material=direct_a, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    low_eut_recipe = RecipeRecord(
        recipe_id="make_target_low_eut",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=12,
        eut=1,
        inputs=(RecipeIO(material=direct_c, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    fast_recipe = RecipeRecord(
        recipe_id="make_target_fast",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=2,
        inputs=(RecipeIO(material=direct_b, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([deep_recipe, slow_recipe, low_eut_recipe, fast_recipe, intermediate_recipe]),
        SearchConfig(max_trees=4),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == [
        "make_target_slow",
        "make_target_low_eut",
        "make_target_fast",
        "make_target_deep",
    ]
    assert result["trees"][0]["metrics"]["step_count"] == result["trees"][1]["metrics"]["step_count"]
    assert result["trees"][0]["metrics"]["total_eut"] == result["trees"][1]["metrics"]["total_eut"]
    assert result["trees"][0]["metrics"]["total_duration"] < result["trees"][1]["metrics"]["total_duration"]
    assert result["trees"][1]["metrics"]["total_eut"] < result["trees"][2]["metrics"]["total_eut"]
    assert result["trees"][3]["metrics"]["step_count"] > result["trees"][0]["metrics"]["step_count"]


def test_solver_prioritizes_branch_candidates_that_match_selected_sources():
    target = MaterialKey(kind="item", id="mod:target_branch", canonical_id="mod:target_branch")
    selected = MaterialKey(kind="item", id="mod:selected_branch", canonical_id="mod:selected_branch")
    unrelated_a = MaterialKey(kind="item", id="mod:unrelated_a_branch", canonical_id="mod:unrelated_a_branch")
    unrelated_b = MaterialKey(kind="item", id="mod:unrelated_b_branch", canonical_id="mod:unrelated_b_branch")
    missing = MaterialKey(kind="item", id="mod:missing_branch", canonical_id="mod:missing_branch")

    unrelated_recipe = RecipeRecord(
        recipe_id="make_target_unrelated_branch",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=1,
        eut=1,
        inputs=(
            RecipeIO(material=unrelated_a, amount=1),
            RecipeIO(material=unrelated_b, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    relevant_recipe = RecipeRecord(
        recipe_id="make_target_relevant_branch",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=10,
        eut=5,
        inputs=(
            RecipeIO(material=selected, amount=1),
            RecipeIO(material=missing, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([unrelated_recipe, relevant_recipe]),
        SearchConfig(
            available_materials=frozenset({selected.canonical_id}),
            max_trees=1,
            max_branching_per_material=1,
        ),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == [
        "make_target_relevant_branch"
    ]


def test_solver_counts_steps_as_recipe_nodes_only():
    target = MaterialKey(kind="item", id="mod:target_machine_steps", canonical_id="mod:target_machine_steps")
    intermediate = MaterialKey(
        kind="item",
        id="mod:intermediate_machine_steps",
        canonical_id="mod:intermediate_machine_steps",
    )
    source = MaterialKey(kind="item", id="mod:source_machine_steps", canonical_id="mod:source_machine_steps")

    target_recipe = RecipeRecord(
        recipe_id="make_target_machine_steps",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=5,
        eut=2,
        inputs=(RecipeIO(material=intermediate, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    intermediate_recipe = RecipeRecord(
        recipe_id="make_intermediate_machine_steps",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="machine",
        duration=7,
        eut=3,
        inputs=(RecipeIO(material=source, amount=1),),
        outputs=(RecipeIO(material=intermediate, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([target_recipe, intermediate_recipe]),
        SearchConfig(available_materials=frozenset({source.canonical_id})),
    )

    assert result["trees"][0]["metrics"]["step_count"] == 2


def test_solver_deprioritizes_disassembly_routes_when_production_route_is_available():
    target = MaterialKey(kind="item", id="mod:target_disassembly", canonical_id="mod:target_disassembly")
    intermediate = MaterialKey(
        kind="item",
        id="mod:intermediate_disassembly",
        canonical_id="mod:intermediate_disassembly",
    )
    selected = MaterialKey(kind="item", id="mod:selected_disassembly", canonical_id="mod:selected_disassembly")
    scrap = MaterialKey(kind="item", id="mod:scrap_disassembly", canonical_id="mod:scrap_disassembly")

    production_recipe = RecipeRecord(
        recipe_id="mod:assembler/target_disassembly",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=20,
        eut=8,
        inputs=(RecipeIO(material=intermediate, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    intermediate_recipe = RecipeRecord(
        recipe_id="mod:lathe/intermediate_disassembly",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="lathe",
        duration=10,
        eut=4,
        inputs=(RecipeIO(material=selected, amount=1),),
        outputs=(RecipeIO(material=intermediate, amount=1),),
        raw_ref={},
    )
    disassembly_recipe = RecipeRecord(
        recipe_id="mod:disassembly/target_disassembly",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="disassembly",
        duration=5,
        eut=2,
        inputs=(RecipeIO(material=scrap, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([production_recipe, intermediate_recipe, disassembly_recipe]),
        SearchConfig(
            available_materials=frozenset({selected.canonical_id}),
            max_trees=1,
            max_branching_per_material=1,
        ),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == [
        "mod:assembler/target_disassembly"
    ]


def test_solver_filters_machine_blacklist_by_machine_type():
    target = MaterialKey(kind="item", id="mod:target_machine_blacklist", canonical_id="mod:target_machine_blacklist")
    source = MaterialKey(kind="item", id="mod:source_machine_blacklist", canonical_id="mod:source_machine_blacklist")

    assembler_recipe = RecipeRecord(
        recipe_id="mod:assembler/blocked_route",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=8,
        inputs=(RecipeIO(material=source, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    lathe_recipe = RecipeRecord(
        recipe_id="mod:lathe/allowed_route",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="lathe",
        duration=20,
        eut=12,
        inputs=(RecipeIO(material=source, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([assembler_recipe, lathe_recipe]),
        SearchConfig(
            available_materials=frozenset({source.canonical_id}),
            machine_blacklist=frozenset({"assembler"}),
            max_trees=5,
        ),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == [
        "mod:lathe/allowed_route"
    ]


def test_solver_filters_machine_blacklist_by_exact_recipe_id():
    target = MaterialKey(kind="item", id="mod:target_recipe_blacklist", canonical_id="mod:target_recipe_blacklist")
    source = MaterialKey(kind="item", id="mod:source_recipe_blacklist", canonical_id="mod:source_recipe_blacklist")

    blocked_recipe = RecipeRecord(
        recipe_id="mod:assembler/blocked_recipe",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=8,
        inputs=(RecipeIO(material=source, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )
    allowed_recipe = RecipeRecord(
        recipe_id="mod:assembler/allowed_recipe",
        source_namespace="mod",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=12,
        eut=9,
        inputs=(RecipeIO(material=source, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={},
    )

    result = solve_target(
        target,
        1,
        build_output_index([blocked_recipe, allowed_recipe]),
        SearchConfig(
            available_materials=frozenset({source.canonical_id}),
            machine_blacklist=frozenset({"mod:assembler/blocked_recipe"}),
            max_trees=5,
        ),
    )

    assert [tree["children"][0]["recipe_id"] for tree in result["trees"]] == [
        "mod:assembler/allowed_recipe"
    ]
