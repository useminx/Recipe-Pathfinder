from __future__ import annotations

import json
from pathlib import Path


def discover_json_files(paths: list[Path]) -> list[Path]:
    discovered: list[Path] = []
    seen: set[str] = set()
    for path in paths:
        current = Path(path)
        if not current.exists():
            raise FileNotFoundError(f"input path does not exist: {current}")
        if current.is_file():
            if current.suffix.lower() == ".json":
                key = str(current.resolve())
                if key not in seen:
                    seen.add(key)
                    discovered.append(current)
            continue
        if current.is_dir():
            for child in sorted(child for child in current.rglob("*.json") if child.is_file()):
                key = str(child.resolve())
                if key in seen:
                    continue
                seen.add(key)
                discovered.append(child)
    return discovered


def load_recipe_documents(paths: list[Path]) -> list[list[dict]]:
    documents: list[list[dict]] = []
    for json_file in discover_json_files(paths):
        raw = json.loads(json_file.read_text(encoding="utf-8-sig"))
        if not isinstance(raw, list):
            raise ValueError(f"expected JSON array in {json_file}")
        documents.append(raw)
    return documents
