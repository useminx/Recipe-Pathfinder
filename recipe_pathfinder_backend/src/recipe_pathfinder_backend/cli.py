"""Command-line interface for recipe_pathfinder_backend."""

from __future__ import annotations

import argparse
import json
from collections.abc import Sequence
from pathlib import Path

from recipe_pathfinder_backend.aliases import AliasMap
from recipe_pathfinder_backend.indexer import build_output_index
from recipe_pathfinder_backend.loader import load_recipe_documents
from recipe_pathfinder_backend.models import MaterialKey
from recipe_pathfinder_backend.normalizer import normalize_documents
from recipe_pathfinder_backend.solver import SearchConfig, solve_target


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="recipe_pathfinder_backend",
        description="Reverse-search GT recipe trees",
    )
    parser.add_argument("--input", action="append", required=True)
    parser.add_argument("--target", required=True)
    parser.add_argument("--target-kind", choices=["item", "fluid"], required=True)
    parser.add_argument("--target-amount", type=_positive_int, default=1)
    parser.add_argument("--available-material", action="append", default=[])
    parser.add_argument("--blacklist", action="append", default=[])
    parser.add_argument("--max-depth", type=_positive_int, default=64)
    parser.add_argument("--max-trees", type=_positive_int, default=100)
    parser.add_argument("--max-branching-per-material", type=_positive_int, default=20)
    parser.add_argument("--max-nodes-per-tree", type=_positive_int, default=1000)
    parser.add_argument("--enable-surplus-reuse", action="store_true")
    parser.add_argument("--output")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    documents = load_recipe_documents([Path(value) for value in args.input])
    recipes = normalize_documents(documents, AliasMap())
    output_index = build_output_index(recipes)
    target = MaterialKey(kind=args.target_kind, id=args.target, canonical_id=args.target)
    config = SearchConfig(
        available_materials=frozenset(args.available_material),
        blacklist=frozenset(args.blacklist),
        max_depth=args.max_depth,
        max_trees=args.max_trees,
        max_branching_per_material=args.max_branching_per_material,
        max_nodes_per_tree=args.max_nodes_per_tree,
        enable_surplus_reuse=args.enable_surplus_reuse,
    )
    result = solve_target(
        target=target,
        target_amount=args.target_amount,
        output_index=output_index,
        config=config,
    )
    payload = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        Path(args.output).write_text(payload, encoding="utf-8")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
