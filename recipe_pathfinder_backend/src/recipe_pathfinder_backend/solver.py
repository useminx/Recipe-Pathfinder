from __future__ import annotations

from dataclasses import dataclass, field
from math import ceil
from time import perf_counter

from recipe_pathfinder_backend.indexer import output_lookup_key
from recipe_pathfinder_backend.models import MaterialKey, RecipeRecord
from recipe_pathfinder_backend.summarize import summarize_result


@dataclass(frozen=True)
class SearchConfig:
    available_materials: frozenset[str] = field(default_factory=frozenset)
    blacklist: frozenset[str] = field(default_factory=frozenset)
    machine_blacklist: frozenset[str] = field(default_factory=frozenset)
    whitelist: frozenset[str] = field(default_factory=frozenset)
    max_depth: int = 64
    max_trees: int = 100
    max_branching_per_material: int = 20
    max_nodes_per_tree: int = 1000
    enable_surplus_reuse: bool = False


def solve_target(
    target: MaterialKey,
    target_amount: int,
    output_index: dict[str, list[RecipeRecord]],
    config: SearchConfig,
) -> dict:
    started = perf_counter()
    elapsed_ms = lambda: (perf_counter() - started) * 1000
    canonical_target = _canonical_id(target)

    trees = []
    candidate_limit = (
        max(1, config.max_trees * config.max_branching_per_material)
        if config.whitelist
        else max(
            config.max_trees,
            config.max_branching_per_material,
        )
    )
    if config.max_nodes_per_tree < 1:
        trees.append(_leaf(canonical_target, target_amount, "max_nodes_reached"))
    else:
        for root_tree, _, _ in _generate_expansions(
            target,
            target_amount,
            output_index,
            config,
            depth=0,
            path=(),
            remaining_nodes=config.max_nodes_per_tree,
            surplus_inventory={} if config.enable_surplus_reuse else None,
            blocked_surplus_keys=frozenset(),
        ):
            trees.append(root_tree)
            if candidate_limit is not None and len(trees) >= candidate_limit:
                break

    if not trees:
        trees.append(_leaf(canonical_target, target_amount, "no_recipe"))

    result = {
        "request": {
            "target": target.id,
            "target_kind": target.kind,
            "target_amount": target_amount,
            "available_materials": sorted(config.available_materials),
            "whitelist": sorted(config.whitelist),
            "blacklist": sorted(config.blacklist),
            "machine_blacklist": sorted(config.machine_blacklist),
            "max_depth": config.max_depth,
            "max_trees": config.max_trees,
            "max_branching_per_material": config.max_branching_per_material,
            "max_nodes_per_tree": config.max_nodes_per_tree,
            "enable_surplus_reuse": config.enable_surplus_reuse,
        },
        "trees": trees,
    }
    if config.available_materials:
        result["trees"] = [
            _prune_irrelevant_subtrees(tree)[0]
            for tree in result["trees"]
        ]
    result["summary"] = summarize_result(result, elapsed_ms())
    if config.whitelist:
        result["trees"] = [
            tree for tree in result["trees"] if _tree_matches_whitelist(tree, config.whitelist)
        ]
    if config.available_materials:
        result["trees"] = [
            tree
            for tree in result["trees"]
            if _tree_matches_available_materials(tree, config.available_materials)
        ]
    result["trees"] = sorted(result["trees"], key=_tree_sort_key)[: config.max_trees]
    result["summary"] = _summarize_final_trees(result["trees"], elapsed_ms())
    return result


def _generate_expansions(
    target: MaterialKey,
    target_amount: int,
    output_index: dict[str, list[RecipeRecord]],
    config: SearchConfig,
    depth: int,
    path: tuple[str, ...],
    remaining_nodes: int,
    surplus_inventory: dict[tuple[str, str], list[dict[str, int | str]]] | None,
    blocked_surplus_keys: frozenset[tuple[str, str]] = frozenset(),
):
    from typing import Iterator
    canonical = _canonical_id(target)
    surplus_key = _surplus_key(target.kind, canonical)
    path_key = output_lookup_key(target.kind, canonical)

    if remaining_nodes <= 0:
        yield _leaf(canonical, target_amount, "max_nodes_reached"), 0, surplus_inventory
        return

    remaining_nodes -= 1

    if canonical in config.available_materials:
        yield _leaf(canonical, target_amount, "source_matched"), remaining_nodes, surplus_inventory
        return
    if canonical in config.blacklist:
        yield _leaf(canonical, target_amount, "blacklisted"), remaining_nodes, surplus_inventory
        return
    if depth >= config.max_depth:
        yield _leaf(canonical, target_amount, "max_depth_reached"), remaining_nodes, surplus_inventory
        return
    if path_key in path:
        return

    if surplus_inventory is not None and surplus_key not in blocked_surplus_keys:
        surplus_chunks = surplus_inventory.get(surplus_key, [])
        for index, surplus_entry in enumerate(surplus_chunks):
            branch_inventory = _clone_surplus_inventory(surplus_inventory)
            branch_chunks = branch_inventory.get(surplus_key, [])
            if not branch_chunks:
                continue
            branch_entry = branch_chunks[index]
            consumed_amount = min(branch_entry["amount"], target_amount)
            if consumed_amount <= 0:
                continue
            remaining_amount = target_amount - consumed_amount
            
            if consumed_amount == branch_entry["amount"]:
                branch_chunks.pop(index)
                if not branch_chunks:
                    branch_inventory.pop(surplus_key, None)
            else:
                branch_entry["amount"] -= consumed_amount

            if remaining_amount <= 0:
                yield (
                    _surplus_node(
                        canonical,
                        target_amount,
                        consumed_amount,
                        0,
                        branch_entry["source_recipe_id"],
                        [],
                    ),
                    remaining_nodes,
                    branch_inventory,
                )
                return
            
            for remaining_node, rn, next_inventory in _generate_expansions(
                target,
                remaining_amount,
                output_index,
                config,
                depth,
                path,
                remaining_nodes,
                branch_inventory,
            blocked_surplus_keys | {surplus_key},
        ):
                if _is_cycle_leaf(remaining_node):
                    continue
                yield (
                    _surplus_node(
                        canonical,
                        target_amount,
                        consumed_amount,
                        remaining_amount,
                        branch_entry["source_recipe_id"],
                        [remaining_node],
                    ),
                    rn,
                    next_inventory,
                )
            return

    candidates = _prioritize_candidates(output_index.get(path_key, []), config)
    if not candidates:
        yield _leaf(canonical, target_amount, "no_recipe"), remaining_nodes, surplus_inventory
        return

    def _build_frontier_children(current_recipe: RecipeRecord, runs: int, current_nodes: int):
        children: list[dict] = []
        next_nodes = current_nodes
        for io in current_recipe.inputs:
            if next_nodes <= 0:
                children.append(_leaf(_canonical_id(io.material), io.amount * runs, "max_nodes_reached"))
                continue

            next_nodes -= 1
            child_canonical = _canonical_id(io.material)
            if child_canonical in config.available_materials:
                status = "source_matched"
            elif child_canonical in config.blacklist:
                status = "blacklisted"
            else:
                status = "no_recipe"
            children.append(_leaf(child_canonical, io.amount * runs, status))

        yield children, next_nodes, surplus_inventory

    def _product_inputs(idx: int, current_nodes: int, current_surplus: dict | None, current_recipe: RecipeRecord, runs: int):
        if idx == len(current_recipe.inputs):
            yield [], current_nodes, current_surplus
            return
        io = current_recipe.inputs[idx]
        if current_nodes <= 0:
            yield [], 0, current_surplus
            return
            
        for c_node, c_nodes, c_surplus in _generate_expansions(
            io.material,
            io.amount * runs,
            output_index,
            config,
            depth + 1,
            path + (path_key,),
            current_nodes,
            current_surplus,
            blocked_surplus_keys,
        ):
            if _is_cycle_leaf(c_node):
                continue
            for rest_children, f_nodes, f_surplus in _product_inputs(idx + 1, c_nodes, c_surplus, current_recipe, runs):
                yield [c_node] + rest_children, f_nodes, f_surplus

    yielded_any = False
    for recipe in candidates[: config.max_branching_per_material]:
        if remaining_nodes <= 0:
            break
            
        total_output = sum(
            output.amount
            for output in recipe.outputs
            if output.chance is None
            and output.material.kind == target.kind
            and _canonical_id(output.material) == canonical
        )
        if total_output <= 0:
            continue
            
        runs = ceil(target_amount / total_output)
        surplus = total_output * runs - target_amount
        
        branch_inventory = None if surplus_inventory is None else _clone_surplus_inventory(surplus_inventory)
        frontier_hit = any(_canonical_id(io.material) in config.available_materials for io in recipe.inputs)
        input_expansions = (
            _build_frontier_children(recipe, runs, remaining_nodes)
            if frontier_hit
            else _product_inputs(0, remaining_nodes, branch_inventory, recipe, runs)
        )

        for recipe_children, final_nodes, final_surplus in input_expansions:
            status = "expanded"
            if final_nodes <= 0 and recipe.inputs:
                status = "max_nodes_reached"
                
            surp_to_return = final_surplus
            if final_surplus is not None and not (status == "max_nodes_reached"):
                surp_to_return = _clone_surplus_inventory(final_surplus)
                _record_surplus_outputs(surp_to_return, recipe, runs, surplus, target.kind, canonical)

            recipe_node = {
                "node_type": "recipe_choice",
                "recipe_id": recipe.recipe_id,
                "recipe_type": recipe.recipe_class,
                "machine_type": recipe.machine_type,
                "duration": recipe.duration,
                "eut": recipe.eut,
                "runs": runs,
                "primary_output": canonical,
                "surplus": surplus,
                "inputs": [
                    {"material": _canonical_id(io.material), "amount": io.amount * runs}
                    for io in recipe.inputs
                ],
                "outputs": [_serialize_output(io, runs) for io in recipe.outputs],
                "children": recipe_children,
            }

            yield (
                {
                    "node_type": "material_need",
                    "material": canonical,
                    "required_amount": target_amount,
                    "status": status,
                    "children": [recipe_node],
                },
                final_nodes,
                surp_to_return,
            )
            yielded_any = True

    if not yielded_any:
        status = "max_nodes_reached" if remaining_nodes <= 0 else "no_recipe"
        yield _leaf(canonical, target_amount, status), remaining_nodes, surplus_inventory


def _prioritize_candidates(candidates: list[RecipeRecord], config: SearchConfig) -> list[RecipeRecord]:
    filtered_candidates = [
        recipe for recipe in candidates if not _matches_machine_blacklist(recipe, config.machine_blacklist)
    ]
    if len(filtered_candidates) < 2:
        return filtered_candidates
    return sorted(filtered_candidates, key=lambda recipe: _candidate_priority_key(recipe, config))


def _candidate_priority_key(recipe: RecipeRecord, config: SearchConfig) -> tuple[int, int, int, int, int, str]:
    input_materials = {_canonical_id(io.material) for io in recipe.inputs}
    source_matches = len(input_materials & config.available_materials)
    whitelist_matches = len(input_materials & config.whitelist)
    total_eut = recipe.eut or 0
    disassembly_penalty = 1 if _is_disassembly_recipe(recipe) else 0
    return (
        -source_matches,
        -whitelist_matches,
        disassembly_penalty,
        len(recipe.inputs),
        total_eut,
        recipe.duration,
        recipe.recipe_id,
    )


def _is_disassembly_recipe(recipe: RecipeRecord) -> bool:
    machine_type = _recipe_machine_key(recipe)
    recipe_id = recipe.recipe_id.lower()
    return machine_type == "disassembly" or ":disassembly/" in recipe_id


def _matches_machine_blacklist(recipe: RecipeRecord, machine_blacklist: frozenset[str]) -> bool:
    if not machine_blacklist:
        return False

    recipe_id = recipe.recipe_id.lower()
    machine_type = _recipe_machine_key(recipe)
    return recipe_id in machine_blacklist or machine_type in machine_blacklist


def _recipe_machine_key(recipe: RecipeRecord) -> str:
    recipe_id = recipe.recipe_id.lower()
    if ":" in recipe_id:
        recipe_path = recipe_id.split(":", 1)[1]
        machine_segment = recipe_path.split("/", 1)[0].strip()
        if machine_segment:
            return machine_segment

    return (recipe.machine_type or "").lower()


def _canonical_id(material: MaterialKey) -> str:
    return material.canonical_id or material.id


def _leaf(material: str, required_amount: int, status: str) -> dict:
    return {
        "node_type": "material_need",
        "material": material,
        "required_amount": required_amount,
        "status": status,
        "children": [],
    }




def _count_nodes(node: dict) -> int:
    return 1 + sum(_count_nodes(child) for child in node.get("children", []))


def _serialize_output(io, runs: int) -> dict:
    output = {
        "material": _canonical_id(io.material),
        "amount": io.amount * runs,
    }
    if io.chance is not None:
        output["chance"] = io.chance
    return output


def _record_surplus_outputs(
    surplus_inventory: dict[tuple[str, str], list[dict[str, int | str]]],
    recipe: RecipeRecord,
    runs: int,
    primary_surplus_amount: int,
    primary_kind: str,
    primary_canonical: str,
) -> None:
    primary_recorded = False
    for output in recipe.outputs:
        if output.chance is not None:
            continue
        output_canonical = _canonical_id(output.material)
        output_key = _surplus_key(output.material.kind, output_canonical)
        if output.material.kind == primary_kind and output_canonical == primary_canonical:
            if not primary_recorded and primary_surplus_amount > 0:
                surplus_inventory.setdefault(output_key, []).append(
                    {
                        "amount": primary_surplus_amount,
                        "source_recipe_id": recipe.recipe_id,
                    }
                )
                primary_recorded = True
            continue
        surplus_amount = output.amount * runs
        surplus_inventory.setdefault(output_key, []).append(
            {
                "amount": surplus_amount,
                "source_recipe_id": recipe.recipe_id,
            }
        )


def _clone_surplus_inventory(
    surplus_inventory: dict[tuple[str, str], list[dict[str, int | str]]]
) -> dict[tuple[str, str], list[dict[str, int | str]]]:
    return {material: [dict(entry) for entry in entries] for material, entries in surplus_inventory.items()}


def _surplus_key(kind: str, canonical: str) -> tuple[str, str]:
    return kind, canonical


def _surplus_node(
    material: str,
    required_amount: int,
    satisfied_amount: int,
    remaining_amount: int,
    source_recipe_id: str,
    children: list[dict],
) -> dict:
    return {
        "node_type": "material_need",
        "material": material,
        "required_amount": required_amount,
        "status": "satisfied_by_surplus",
        "satisfied_amount": satisfied_amount,
        "remaining_amount": remaining_amount,
        "source_recipe_id": source_recipe_id,
        "children": children,
    }


def _tree_sort_key(tree: dict) -> tuple[int, int, int, int]:
    metrics = tree.get("metrics", {})
    status_rank = 0 if tree.get("status") == "fully_resolved" else 1
    return (
        status_rank,
        metrics.get("step_count", 0),
        metrics.get("total_eut", 0),
        metrics.get("total_duration", 0),
    )


def _summarize_final_trees(trees: list[dict], elapsed_ms: float) -> dict:
    summary = {
        "tree_count": len(trees),
        "fully_resolved_count": 0,
        "partially_resolved_count": 0,
        "cycle_cut_count": 0,
        "blacklist_cut_count": 0,
        "no_recipe_count": 0,
        "max_depth_cut_count": 0,
        "surplus_satisfied_count": 0,
        "search_duration_ms": round(elapsed_ms, 3),
    }
    for tree in trees:
        if tree.get("status") == "fully_resolved":
            summary["fully_resolved_count"] += 1
        else:
            summary["partially_resolved_count"] += 1
        reasons = set(tree.get("status_reasons", []))
        summary["cycle_cut_count"] += int("cycle_detected" in reasons)
        summary["blacklist_cut_count"] += int("blacklisted" in reasons)
        summary["no_recipe_count"] += int("no_recipe" in reasons)
        summary["max_depth_cut_count"] += int("max_depth_reached" in reasons)
        summary["surplus_satisfied_count"] += tree.get("metrics", {}).get("surplus_satisfied_count", 0)
    return summary


def _is_cycle_leaf(node: dict) -> bool:
    return node.get("status") == "cycle_detected" and not node.get("children")


def _tree_matches_whitelist(tree: dict, whitelist: frozenset[str]) -> bool:
    if not whitelist:
        return True
    return whitelist <= _collect_tree_material_ids(tree)


def _tree_matches_available_materials(tree: dict, available_materials: frozenset[str]) -> bool:
    if not available_materials:
        return True
    return available_materials <= _collect_tree_material_ids(tree)


def _collect_tree_material_ids(node: dict) -> set[str]:
    found: set[str] = set()

    material = node.get("material")
    if isinstance(material, str):
        found.add(material)

    primary_output = node.get("primary_output")
    if isinstance(primary_output, str):
        found.add(primary_output)

    for key in ("inputs", "outputs"):
        for io in node.get(key, []):
            material_id = io.get("material")
            if isinstance(material_id, str):
                found.add(material_id)

    for child in node.get("children", []):
        found.update(_collect_tree_material_ids(child))

    return found


def _prune_irrelevant_subtrees(node: dict) -> tuple[dict, bool]:
    self_relevant = _node_matches_filters(node)

    children = node.get("children", [])
    if not children:
        return node, self_relevant

    pruned_children: list[dict] = []
    child_relevant = False
    for child in children:
        pruned_child, is_relevant = _prune_irrelevant_subtrees(child)
        pruned_children.append(pruned_child)
        child_relevant = child_relevant or is_relevant

    relevant = self_relevant or child_relevant
    if node.get("node_type") == "material_need" and not relevant:
        return _leaf(node.get("material", ""), node.get("required_amount", 0), "no_recipe"), False

    updated = dict(node)
    updated["children"] = pruned_children
    return updated, relevant


def _node_matches_filters(node: dict) -> bool:
    return node.get("status") == "source_matched"
