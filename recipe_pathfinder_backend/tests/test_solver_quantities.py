from recipe_pathfinder_backend.indexer import build_output_index
from recipe_pathfinder_backend.models import MaterialKey, RecipeIO, RecipeRecord
from recipe_pathfinder_backend.solver import SearchConfig, _expand_need, solve_target


def test_solver_uses_ceil_for_recipe_runs_and_tracks_surplus():
    plate = MaterialKey(kind="item", id="gtceu:plate", canonical_id="gtceu:plate")
    ingot = MaterialKey(kind="item", id="gtceu:ingot", canonical_id="gtceu:ingot")
    recipe = RecipeRecord(
        recipe_id="gtceu:press/plate",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="press",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=ingot, amount=1),),
        outputs=(RecipeIO(material=plate, amount=2),),
        raw_ref={"id": "gtceu:press/plate"},
    )

    result = solve_target(
        target=plate,
        target_amount=3,
        output_index=build_output_index([recipe]),
        config=SearchConfig(),
    )

    recipe_node = result["trees"][0]["children"][0]
    child_need = recipe_node["children"][0]

    assert recipe_node["runs"] == 2
    assert recipe_node["surplus"] == 1
    assert child_need["required_amount"] == 2


def test_solver_aggregates_duplicate_matching_outputs_before_run_count():
    plate = MaterialKey(kind="item", id="gtceu:plate", canonical_id="gtceu:plate")
    ingot = MaterialKey(kind="item", id="gtceu:ingot", canonical_id="gtceu:ingot")
    byproduct = MaterialKey(kind="item", id="gtceu:scrap", canonical_id="gtceu:scrap")
    recipe = RecipeRecord(
        recipe_id="gtceu:assembler/plate_bundle",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=ingot, amount=2),),
        outputs=(
            RecipeIO(material=plate, amount=1),
            RecipeIO(material=plate, amount=2),
            RecipeIO(material=byproduct, amount=7),
        ),
        raw_ref={"id": "gtceu:assembler/plate_bundle"},
    )

    result = solve_target(
        target=plate,
        target_amount=5,
        output_index=build_output_index([recipe]),
        config=SearchConfig(),
    )

    recipe_node = result["trees"][0]["children"][0]
    child_need = recipe_node["children"][0]

    assert recipe_node["runs"] == 2
    assert recipe_node["surplus"] == 1
    assert child_need["required_amount"] == 4
    assert sum(output["amount"] for output in recipe_node["outputs"] if output["material"] == "gtceu:plate") == 6
    assert {"material": "gtceu:scrap", "amount": 14} in recipe_node["outputs"]


def test_solver_preserves_chance_for_probabilistic_recipe_outputs():
    plate = MaterialKey(kind="item", id="gtceu:plate", canonical_id="gtceu:plate")
    ingot = MaterialKey(kind="item", id="gtceu:ingot", canonical_id="gtceu:ingot")
    bonus = MaterialKey(kind="item", id="gtceu:bonus_dust", canonical_id="gtceu:bonus_dust")
    recipe = RecipeRecord(
        recipe_id="gtceu:press/plate_with_bonus",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="press",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=ingot, amount=1),),
        outputs=(
            RecipeIO(material=plate, amount=2),
            RecipeIO(material=bonus, amount=1, chance=0.25),
        ),
        raw_ref={"id": "gtceu:press/plate_with_bonus"},
    )

    result = solve_target(
        target=plate,
        target_amount=3,
        output_index=build_output_index([recipe]),
        config=SearchConfig(),
    )

    recipe_node = result["trees"][0]["children"][0]

    assert {"material": "gtceu:bonus_dust", "amount": 2, "chance": 0.25} in recipe_node["outputs"]


def test_solver_satisfies_later_need_from_branch_local_surplus_when_enabled():
    target = MaterialKey(kind="item", id="gtceu:target", canonical_id="gtceu:target")
    main = MaterialKey(kind="item", id="gtceu:main", canonical_id="gtceu:main")
    scrap = MaterialKey(kind="item", id="gtceu:scrap", canonical_id="gtceu:scrap")
    base = MaterialKey(kind="item", id="gtceu:base", canonical_id="gtceu:base")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=scrap, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_with_bonus",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=scrap, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/main_with_bonus"},
    )
    output_index = build_output_index([target_recipe, main_recipe])

    disabled_result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(),
    )
    enabled_result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    disabled_bonus_need = disabled_result["trees"][0]["children"][0]["children"][1]
    enabled_bonus_need = enabled_result["trees"][0]["children"][0]["children"][1]

    assert disabled_bonus_need["status"] == "expanded"
    assert enabled_bonus_need["status"] == "satisfied_by_surplus"
    assert enabled_bonus_need["node_type"] == "material_need"
    assert enabled_bonus_need["material"] == "gtceu:scrap"
    assert enabled_bonus_need["required_amount"] == 1
    assert enabled_bonus_need["satisfied_amount"] == 1
    assert enabled_bonus_need["remaining_amount"] == 0
    assert enabled_bonus_need["source_recipe_id"] == "gtceu:assembler/main_with_bonus"
    assert enabled_bonus_need["children"] == []


def test_solver_keeps_item_and_fluid_surplus_entries_separate():
    target = MaterialKey(kind="item", id="gtceu:target", canonical_id="gtceu:target")
    main = MaterialKey(kind="item", id="gtceu:main", canonical_id="gtceu:main")
    shared_item = MaterialKey(kind="item", id="gtceu:shared", canonical_id="gtceu:shared")
    shared_fluid = MaterialKey(kind="fluid", id="gtceu:shared", canonical_id="gtceu:shared")
    base = MaterialKey(kind="item", id="gtceu:base", canonical_id="gtceu:base")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_kind_split",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=shared_fluid, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_kind_split"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_with_item_shared",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=shared_item, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/main_with_item_shared"},
    )
    output_index = build_output_index([target_recipe, main_recipe])

    enabled_result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    fluid_need = enabled_result["trees"][0]["children"][0]["children"][1]

    assert fluid_need["status"] == "no_recipe"
    assert fluid_need["children"] == []


def test_solver_prefers_source_and_blacklist_before_surplus_reuse():
    target = MaterialKey(kind="item", id="gtceu:target2", canonical_id="gtceu:target2")
    main = MaterialKey(kind="item", id="gtceu:main2", canonical_id="gtceu:main2")
    source = MaterialKey(kind="item", id="gtceu:source2", canonical_id="gtceu:source2")
    blacklisted = MaterialKey(kind="item", id="gtceu:blacklisted2", canonical_id="gtceu:blacklisted2")
    base = MaterialKey(kind="item", id="gtceu:base2", canonical_id="gtceu:base2")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_semantics",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=source, amount=1),
            RecipeIO(material=blacklisted, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_semantics"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_with_semantics_byproducts",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=source, amount=1),
            RecipeIO(material=blacklisted, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/main_with_semantics_byproducts"},
    )
    output_index = build_output_index([target_recipe, main_recipe])

    enabled_result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(
            available_materials=frozenset({source.canonical_id}),
            blacklist=frozenset({blacklisted.canonical_id}),
            enable_surplus_reuse=True,
        ),
    )

    source_need = enabled_result["trees"][0]["children"][0]["children"][1]
    black_need = enabled_result["trees"][0]["children"][0]["children"][2]

    assert source_need["status"] == "source_matched"
    assert black_need["status"] == "blacklisted"


def test_solver_does_not_combine_multiple_surplus_chunks_from_different_sources():
    target = MaterialKey(kind="item", id="gtceu:target3", canonical_id="gtceu:target3")
    main = MaterialKey(kind="item", id="gtceu:main3", canonical_id="gtceu:main3")
    other = MaterialKey(kind="item", id="gtceu:other3", canonical_id="gtceu:other3")
    shared = MaterialKey(kind="item", id="gtceu:shared3", canonical_id="gtceu:shared3")
    base = MaterialKey(kind="item", id="gtceu:base3", canonical_id="gtceu:base3")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_chunks",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=other, amount=1),
            RecipeIO(material=shared, amount=2),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_chunks"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_chunk",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=shared, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/main_chunk"},
    )
    other_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/other_chunk",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=other, amount=1),
            RecipeIO(material=shared, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/other_chunk"},
    )
    output_index = build_output_index([target_recipe, main_recipe, other_recipe])

    enabled_result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    shared_need = enabled_result["trees"][0]["children"][0]["children"][2]

    assert shared_need["status"] == "satisfied_by_surplus"
    assert shared_need["satisfied_amount"] == 1
    assert shared_need["remaining_amount"] == 1
    assert shared_need["source_recipe_id"] == "gtceu:assembler/main_chunk"
    assert shared_need["children"][0]["status"] == "expanded"


def test_solver_does_not_leak_surplus_from_ambiguous_multicandidate_need():
    target = MaterialKey(kind="item", id="gtceu:target4", canonical_id="gtceu:target4")
    choice = MaterialKey(kind="item", id="gtceu:choice4", canonical_id="gtceu:choice4")
    spill = MaterialKey(kind="item", id="gtceu:spill4", canonical_id="gtceu:spill4")
    base = MaterialKey(kind="item", id="gtceu:base4", canonical_id="gtceu:base4")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_ambiguous",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=choice, amount=1),
            RecipeIO(material=spill, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_ambiguous"},
    )
    choice_recipe_primary = RecipeRecord(
        recipe_id="gtceu:assembler/choice_primary",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(RecipeIO(material=choice, amount=1),),
        raw_ref={"id": "gtceu:assembler/choice_primary"},
    )
    choice_recipe_with_spill = RecipeRecord(
        recipe_id="gtceu:assembler/choice_with_spill",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=choice, amount=1),
            RecipeIO(material=spill, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/choice_with_spill"},
    )
    output_index = build_output_index([target_recipe, choice_recipe_primary, choice_recipe_with_spill])

    enabled_result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    spill_need = enabled_result["trees"][0]["children"][0]["children"][1]

    assert spill_need["status"] == "expanded"


def test_solver_matches_primary_output_and_records_same_canonical_fluid_surplus():
    target = MaterialKey(kind="item", id="gtceu:target5", canonical_id="gtceu:target5")
    fluid = MaterialKey(kind="fluid", id="gtceu:target5", canonical_id="gtceu:target5")
    main = MaterialKey(kind="item", id="gtceu:main5", canonical_id="gtceu:main5")
    base = MaterialKey(kind="item", id="gtceu:base5", canonical_id="gtceu:base5")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_fluid_byproduct",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=fluid, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_fluid_byproduct"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_fluid_byproduct",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=fluid, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/main_fluid_byproduct"},
    )
    output_index = build_output_index([target_recipe, main_recipe])

    result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    recipe_node = result["trees"][0]["children"][0]
    fluid_need = recipe_node["children"][1]

    assert recipe_node["runs"] == 1
    assert fluid_need["status"] == "satisfied_by_surplus"
    assert fluid_need["source_recipe_id"] == "gtceu:assembler/main_fluid_byproduct"


def test_solver_does_not_self_satisfy_from_its_own_byproduct():
    target = MaterialKey(kind="item", id="gtceu:target6", canonical_id="gtceu:target6")
    intermediate = MaterialKey(kind="item", id="gtceu:intermediate6", canonical_id="gtceu:intermediate6")
    spill = MaterialKey(kind="item", id="gtceu:spill6", canonical_id="gtceu:spill6")
    base = MaterialKey(kind="item", id="gtceu:base6", canonical_id="gtceu:base6")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_self_satisfy",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=intermediate, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_self_satisfy"},
    )
    intermediate_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/intermediate_self_satisfy",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=spill, amount=1),),
        outputs=(
            RecipeIO(material=intermediate, amount=1),
            RecipeIO(material=spill, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/intermediate_self_satisfy"},
    )
    output_index = build_output_index([target_recipe, intermediate_recipe])

    result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    spill_need = result["trees"][0]["children"][0]["children"][0]["children"][0]["children"][0]

    assert spill_need["status"] == "expanded"


def test_solver_partially_consumes_surplus_and_expands_the_remainder():
    target = MaterialKey(kind="item", id="gtceu:target7", canonical_id="gtceu:target7")
    main = MaterialKey(kind="item", id="gtceu:main7", canonical_id="gtceu:main7")
    other = MaterialKey(kind="item", id="gtceu:other7", canonical_id="gtceu:other7")
    spill = MaterialKey(kind="item", id="gtceu:spill7", canonical_id="gtceu:spill7")
    base = MaterialKey(kind="item", id="gtceu:base7", canonical_id="gtceu:base7")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_partial_chunk",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=other, amount=1),
            RecipeIO(material=spill, amount=3),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_partial_chunk"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_partial_chunk",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=spill, amount=2),
        ),
        raw_ref={"id": "gtceu:assembler/main_partial_chunk"},
    )
    other_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/other_partial_chunk",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(
            RecipeIO(material=other, amount=1),
            RecipeIO(material=spill, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/other_partial_chunk"},
    )
    spill_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/spill_partial_chunk",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(RecipeIO(material=spill, amount=1),),
        raw_ref={"id": "gtceu:assembler/spill_partial_chunk"},
    )
    output_index = build_output_index([target_recipe, main_recipe, other_recipe, spill_recipe])

    result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    spill_need = result["trees"][0]["children"][0]["children"][2]
    remainder_need = spill_need["children"][0]
    remainder_recipe = remainder_need["children"][0]

    assert spill_need["status"] == "satisfied_by_surplus"
    assert spill_need["satisfied_amount"] == 2
    assert spill_need["remaining_amount"] == 1
    assert spill_need["source_recipe_id"] == "gtceu:assembler/main_partial_chunk"
    assert remainder_need["status"] == "expanded"
    assert remainder_recipe["recipe_id"] == "gtceu:assembler/main_partial_chunk"


def test_solver_reuses_primary_output_overflow_later_in_branch():
    target = MaterialKey(kind="item", id="gtceu:target7b", canonical_id="gtceu:target7b")
    main = MaterialKey(kind="item", id="gtceu:main7b", canonical_id="gtceu:main7b")
    base = MaterialKey(kind="item", id="gtceu:base7b", canonical_id="gtceu:base7b")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_primary_overflow",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=main, amount=1),
            RecipeIO(material=main, amount=1),
        ),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_primary_overflow"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_primary_overflow",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=base, amount=1),),
        outputs=(RecipeIO(material=main, amount=2),),
        raw_ref={"id": "gtceu:assembler/main_primary_overflow"},
    )
    output_index = build_output_index([target_recipe, main_recipe])

    result = solve_target(
        target=target,
        target_amount=1,
        output_index=output_index,
        config=SearchConfig(enable_surplus_reuse=True),
    )

    first_main_need = result["trees"][0]["children"][0]["children"][0]
    second_main_need = result["trees"][0]["children"][0]["children"][1]
    third_main_need = result["trees"][0]["children"][0]["children"][2]

    assert first_main_need["status"] == "expanded"
    assert second_main_need["status"] == "satisfied_by_surplus"
    assert second_main_need["satisfied_amount"] == 1
    assert second_main_need["remaining_amount"] == 0
    assert second_main_need["source_recipe_id"] == "gtceu:assembler/main_primary_overflow"
    assert third_main_need["status"] == "expanded"
    assert result["summary"]["surplus_satisfied_count"] == 1


def test_truncated_candidate_does_not_seed_surplus_for_later_need():
    target = MaterialKey(kind="item", id="gtceu:target8", canonical_id="gtceu:target8")
    main = MaterialKey(kind="item", id="gtceu:main8", canonical_id="gtceu:main8")
    spill = MaterialKey(kind="item", id="gtceu:spill8", canonical_id="gtceu:spill8")
    deep1 = MaterialKey(kind="item", id="gtceu:deep1_8", canonical_id="gtceu:deep1_8")
    deep2 = MaterialKey(kind="item", id="gtceu:deep2_8", canonical_id="gtceu:deep2_8")

    target_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/target_truncated",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(RecipeIO(material=main, amount=1),),
        outputs=(RecipeIO(material=target, amount=1),),
        raw_ref={"id": "gtceu:assembler/target_truncated"},
    )
    main_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/main_truncated",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=deep1, amount=1),
            RecipeIO(material=deep2, amount=1),
        ),
        outputs=(
            RecipeIO(material=main, amount=1),
            RecipeIO(material=spill, amount=1),
        ),
        raw_ref={"id": "gtceu:assembler/main_truncated"},
    )
    deep1_recipe = RecipeRecord(
        recipe_id="gtceu:assembler/deep1_truncated",
        source_namespace="gtceu",
        recipe_class="Recipe",
        machine_type="assembler",
        duration=10,
        eut=16,
        inputs=(
            RecipeIO(material=deep2, amount=1),
            RecipeIO(material=spill, amount=1),
        ),
        outputs=(RecipeIO(material=deep1, amount=1),),
        raw_ref={"id": "gtceu:assembler/deep1_truncated"},
    )
    output_index = build_output_index([target_recipe, main_recipe, deep1_recipe])
    config = SearchConfig(enable_surplus_reuse=True)

    _, _, inventory = _expand_need(
        target=main,
        target_amount=1,
        output_index=output_index,
        config=config,
        depth=0,
        path=(),
        remaining_nodes=4,
        surplus_inventory={},
    )
    spill_node, _, _ = _expand_need(
        target=spill,
        target_amount=1,
        output_index=output_index,
        config=config,
        depth=0,
        path=(),
        remaining_nodes=4,
        surplus_inventory=inventory,
    )

    assert spill_node["status"] != "satisfied_by_surplus"
