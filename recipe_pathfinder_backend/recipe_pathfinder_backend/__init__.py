"""Bootstrap package for direct module execution from the project root."""

from __future__ import annotations

from pathlib import Path

__all__ = ["__version__"]

__version__ = "0.0.0"

_PACKAGE_DIR = Path(__file__).resolve().parent
_SRC_PACKAGE_DIR = _PACKAGE_DIR.parent / "src" / "recipe_pathfinder_backend"

if _SRC_PACKAGE_DIR.is_dir():
    __path__.append(str(_SRC_PACKAGE_DIR))
