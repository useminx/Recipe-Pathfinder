import json
import subprocess
import sys
from pathlib import Path

import pytest

from recipe_pathfinder_backend.cli import build_parser, main


def test_build_parser_accepts_required_cli_options():
    parser = build_parser()

    args = parser.parse_args(
        [
            "--input",
            "recipes.json",
            "--target",
            "gtceu:lv_machine_hull",
            "--target-kind",
            "item",
        ]
    )

    assert args.input == ["recipes.json"]
    assert args.target == "gtceu:lv_machine_hull"
    assert args.target_kind == "item"
    assert args.target_amount == 1
    assert args.available_material == []
    assert args.blacklist == []
    assert args.max_depth == 64
    assert args.max_trees == 100
    assert args.max_branching_per_material == 20
    assert args.max_nodes_per_tree == 1000
    assert args.output is None


def test_build_parser_defaults_enable_surplus_reuse_to_false():
    parser = build_parser()

    args = parser.parse_args(
        [
            "--input",
            "recipes.json",
            "--target",
            "gtceu:lv_machine_hull",
            "--target-kind",
            "item",
        ]
    )

    assert args.enable_surplus_reuse is False


@pytest.mark.parametrize(
    ("option", "value"),
    [
        ("--target-amount", "0"),
        ("--target-amount", "-1"),
        ("--max-depth", "0"),
        ("--max-depth", "-1"),
        ("--max-trees", "0"),
        ("--max-trees", "-1"),
        ("--max-branching-per-material", "0"),
        ("--max-branching-per-material", "-1"),
        ("--max-nodes-per-tree", "0"),
        ("--max-nodes-per-tree", "-1"),
    ],
)
def test_build_parser_rejects_non_positive_integer_limits(option, value):
    parser = build_parser()

    with pytest.raises(SystemExit) as excinfo:
        parser.parse_args(
            [
                "--input",
                "recipes.json",
                "--target",
                "gtceu:lv_machine_hull",
                "--target-kind",
                "item",
                option,
                value,
            ]
        )

    assert excinfo.value.code == 2


def test_cli_can_solve_from_fixture(tmp_path):
    root = Path(__file__).resolve().parents[1]
    fixture = root / "tests" / "fixtures" / "sample_recipes.json"
    output_file = tmp_path / "result.json"

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "recipe_pathfinder_backend.cli",
            "--input",
            str(fixture),
            "--target",
            "minecraft:bucket",
            "--target-kind",
            "item",
            "--target-amount",
            "1",
            "--output",
            str(output_file),
        ],
        cwd=root,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(output_file.read_text(encoding="utf-8"))
    assert payload["summary"]["tree_count"] == 1


def test_cli_sets_request_enable_surplus_reuse_when_flag_is_passed(tmp_path):
    root = Path(__file__).resolve().parents[1]
    fixture = root / "tests" / "fixtures" / "sample_recipes.json"
    output_file = tmp_path / "result.json"

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "recipe_pathfinder_backend.cli",
            "--input",
            str(fixture),
            "--target",
            "minecraft:bucket",
            "--target-kind",
            "item",
            "--enable-surplus-reuse",
            "--output",
            str(output_file),
        ],
        cwd=root,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(output_file.read_text(encoding="utf-8"))
    assert payload["request"]["enable_surplus_reuse"] is True
    assert payload["request"]["max_trees"] == 100
    assert payload["request"]["max_depth"] == 64


def test_main_passes_enable_surplus_reuse_into_search_config(tmp_path, monkeypatch):
    captured = {}

    def fake_load_recipe_documents(paths):
        captured["input_paths"] = paths
        return [{}]

    def fake_normalize_documents(documents, alias_map):
        captured["normalized"] = True
        return []

    def fake_build_output_index(recipes):
        captured["indexed"] = True
        return {}

    def fake_solve_target(*, target, target_amount, output_index, config):
        captured["config"] = config
        return {
            "request": {
                "target": target.id,
                "target_kind": target.kind,
                "target_amount": target_amount,
                "available_materials": [],
                "blacklist": [],
                "max_depth": config.max_depth,
                "max_trees": config.max_trees,
                "max_branching_per_material": config.max_branching_per_material,
                "max_nodes_per_tree": config.max_nodes_per_tree,
                "enable_surplus_reuse": config.enable_surplus_reuse,
            },
            "trees": [],
            "summary": {"tree_count": 0},
        }

    output_file = tmp_path / "result.json"
    monkeypatch.setattr(
        "recipe_pathfinder_backend.cli.load_recipe_documents",
        fake_load_recipe_documents,
    )
    monkeypatch.setattr(
        "recipe_pathfinder_backend.cli.normalize_documents",
        fake_normalize_documents,
    )
    monkeypatch.setattr(
        "recipe_pathfinder_backend.cli.build_output_index",
        fake_build_output_index,
    )
    monkeypatch.setattr("recipe_pathfinder_backend.cli.solve_target", fake_solve_target)

    exit_code = main(
        [
            "--input",
            "recipes.json",
            "--target",
            "minecraft:bucket",
            "--target-kind",
            "item",
            "--enable-surplus-reuse",
            "--output",
            str(output_file),
        ]
    )

    assert exit_code == 0
    assert captured["config"].enable_surplus_reuse is True


def test_cli_output_keeps_surplus_summary_metric(tmp_path):
    root = Path(__file__).resolve().parents[1]
    fixture = root / "tests" / "fixtures" / "sample_recipes.json"
    output_file = tmp_path / "result.json"

    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "recipe_pathfinder_backend.cli",
            "--input",
            str(fixture),
            "--target",
            "minecraft:bucket",
            "--target-kind",
            "item",
            "--output",
            str(output_file),
        ],
        cwd=root,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(output_file.read_text(encoding="utf-8"))
    assert "surplus_satisfied_count" in payload["summary"]
