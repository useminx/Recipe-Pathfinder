# recipe_pathfinder_backend

Local Python backend and CLI for reverse-searching GT recipe trees from dumped recipe JSON.

Run the CLI directly from the package root, for example:

```powershell
python -m recipe_pathfinder_backend.cli --input ".\tests\fixtures\sample_recipes.json" --target "minecraft:bucket" --target-kind item
```

`--max-trees` limits how many top-level recipe alternatives are returned for the requested target after ranking.

Surplus reuse is disabled by default. Pass `--enable-surplus-reuse` to allow later needs in the same tree to consume earlier deterministic surplus, including partial reuse and primary-output overflow reuse.

Default tree ordering prefers fully resolved trees first, then fewer failures, then fewer steps, then lower duration, then lower EUt.

The JSON output echoes the active request parameters, including surplus mode and tree/branch/depth limits, so ranked results remain reproducible.

## Output Shape

Top-level JSON contains:

- `request`: the resolved search inputs, including `target`, `target_kind`, `target_amount`, `available_materials`, `blacklist`, `max_depth`, `max_trees`, `max_branching_per_material`, `max_nodes_per_tree`, and `enable_surplus_reuse`
- `summary`: aggregate counts for the returned tree list, including `tree_count`, `fully_resolved_count`, `partially_resolved_count`, cut/failure counters, `surplus_satisfied_count`, and `search_duration_ms`
- `trees`: ranked recipe trees

Each returned tree includes:

- `status`: `fully_resolved` or `partially_resolved`
- `status_reasons`: why the tree is partial, for example `no_recipe`, `blacklisted`, `cycle_detected`, `max_depth_reached`, or `max_nodes_reached`
- `metrics`: ranking metrics such as `step_count`, `total_duration`, `total_eut`, `surplus_satisfied_count`, and `failure_count`

Node types:

- `material_need`: a required material node
- `recipe_choice`: a chosen recipe branch

`material_need` may also use `status: "satisfied_by_surplus"` when earlier deterministic surplus in the same tree satisfies all or part of the need. In that case the node exposes `satisfied_amount`, `remaining_amount`, `source_recipe_id`, and any remaining expansion in `children`.

## Ranking Rules

Returned trees are sorted by this default priority:

1. `fully_resolved` before `partially_resolved`
2. fewer failure/cutoff reasons
3. fewer steps
4. lower total duration
5. lower total EUt

`max_trees` is applied after ranking, not before.

See `docs/sample_requests/basic-search.json` for a real-data request template using the Odyssey dumps.
