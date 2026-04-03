"""FastAPI server for GT Pathfinder."""

from __future__ import annotations

import json
import shutil
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from recipe_pathfinder_backend.aliases import AliasMap, build_namespace_aliases
from recipe_pathfinder_backend.indexer import build_output_index, output_lookup_key
from recipe_pathfinder_backend.loader import load_recipe_documents
from recipe_pathfinder_backend.models import MaterialKey
from recipe_pathfinder_backend.normalizer import normalize_documents
from recipe_pathfinder_backend.solver import SearchConfig, solve_target

app_state = {
    "output_index": None,
    "all_materials": [],
    "machine_catalog": [],
    "aliases": AliasMap(),
}

current_dir = Path(__file__).parent.resolve()
RECIPES_DIR = current_dir / "data" / "recipes"
RECIPES_DIR.mkdir(parents=True, exist_ok=True)


def _machine_catalog_key(recipe_id: str, machine_type: str) -> str:
    normalized_recipe_id = recipe_id.lower()
    if ":" in normalized_recipe_id:
        recipe_path = normalized_recipe_id.split(":", 1)[1]
        machine_segment = recipe_path.split("/", 1)[0].strip()
        if machine_segment:
            return machine_segment
    return machine_type.lower()


def reload_recipes() -> None:
    print(f"Reloading recipes from {RECIPES_DIR} ...")
    try:
        documents = load_recipe_documents([RECIPES_DIR])
        if not documents:
            app_state["output_index"] = None
            app_state["all_materials"] = []
            app_state["machine_catalog"] = []
            app_state["aliases"] = AliasMap()
            print("Warning: no valid recipe JSON arrays found.")
            return

        aliases = build_namespace_aliases(documents)
        recipes = normalize_documents(documents, aliases)
        app_state["output_index"] = build_output_index(recipes)
        app_state["aliases"] = aliases

        materials_set: set[str] = set()
        machine_catalog: dict[str, tuple[str, int]] = {}
        for recipe in recipes:
            for io in recipe.inputs:
                materials_set.add(io.material.canonical_id or io.material.id)
            for io in recipe.outputs:
                materials_set.add(io.material.canonical_id or io.material.id)
            machine_key = _machine_catalog_key(recipe.recipe_id, recipe.machine_type or "")
            if machine_key and machine_key not in machine_catalog:
                machine_catalog[machine_key] = (recipe.recipe_id, recipe.eut)

        app_state["all_materials"] = sorted(materials_set)
        app_state["machine_catalog"] = [
            {"machine_type": machine_type, "recipe_id": recipe_id, "eut": eut}
            for machine_type, (recipe_id, eut) in sorted(machine_catalog.items())
        ]
        print(f"Recipes loaded successfully. Found {len(materials_set)} unique materials.")
    except Exception as exc:  # pragma: no cover - startup logging path
        print(f"Error loading recipes: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    initial_path = Path(r"C:\Users\ASUS\Desktop\gto\recipes_example.json")
    if not list(RECIPES_DIR.glob("*.json")) and initial_path.exists():
        print("Copying default recipes_example.json to cache...")
        shutil.copy(initial_path, RECIPES_DIR / "recipes_example.json")

    reload_recipes()
    yield
    app_state["output_index"] = None
    app_state["all_materials"] = []
    app_state["machine_catalog"] = []
    app_state["aliases"] = AliasMap()


app = FastAPI(
    title="GT Pathfinder API",
    description="Local solver API for GT Pathfinder recipe search.",
    version="1.0.0",
    docs_url=None,
    lifespan=lifespan,
)


@app.get("/docs", include_in_schema=False)
def custom_swagger_ui_html():
    html = get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} - API docs",
    )
    return HTMLResponse(html.body.decode("utf-8"))


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SolveRequest(BaseModel):
    target: str = Field(..., description="Requested target material ID.")
    target_kind: str = Field("item", description="Target kind: item or fluid.")
    target_amount: int = Field(1, ge=1, description="Requested target amount.")
    available_materials: list[str] = Field(default_factory=list, description="Available source materials.")
    whitelist: list[str] = Field(default_factory=list, description="Materials that must appear in each tree.")
    blacklist: list[str] = Field(default_factory=list, description="Materials that cut matching branches.")
    max_depth: int = Field(64, ge=1, description="Maximum recursion depth.")
    max_trees: int = Field(100, ge=1, description="Maximum number of returned trees.")
    max_branching_per_material: int = Field(20, ge=1, description="Maximum recipe choices per material.")
    max_nodes_per_tree: int = Field(1000, ge=1, description="Maximum nodes allowed per tree.")
    enable_surplus_reuse: bool = Field(False, description="Whether to reuse same-tree surplus outputs.")


def _split_blacklist_entries(raw_entries: list[str], aliases: AliasMap) -> tuple[frozenset[str], frozenset[str]]:
    material_blacklist: set[str] = set()
    machine_blacklist: set[str] = set()

    for raw_entry in raw_entries:
        entry = raw_entry.strip()
        if not entry:
            continue
        if entry.startswith("@"):
            machine_entry = entry[1:].strip().lower()
            if machine_entry:
                machine_blacklist.add(machine_entry)
            continue
        material_blacklist.add(aliases.normalize(entry))

    return frozenset(material_blacklist), frozenset(machine_blacklist)


def _resolve_target_kind(target_id: str, requested_kind: str) -> str:
    output_index = app_state.get("output_index") or {}
    aliases: AliasMap = app_state.get("aliases") or AliasMap()
    normalized_target = aliases.normalize(target_id)
    if output_index.get(output_lookup_key(requested_kind, normalized_target)):
        return requested_kind

    # Frontend target inputs are raw IDs and currently default to item. If the
    # requested ID only exists as a fluid output, automatically correct it.
    if requested_kind == "item" and output_index.get(output_lookup_key("fluid", normalized_target)):
        return "fluid"

    return requested_kind


@app.post("/api/solve", summary="Search recipe trees")
def solve(request: SolveRequest):
    if app_state["output_index"] is None:
        raise HTTPException(status_code=503, detail="Server not initialized or no recipes loaded.")

    aliases: AliasMap = app_state.get("aliases") or AliasMap()
    normalized_target = aliases.normalize(request.target)
    material_blacklist, machine_blacklist = _split_blacklist_entries(request.blacklist, aliases)

    target_key = MaterialKey(
        kind=_resolve_target_kind(request.target, request.target_kind),
        id=request.target,
        canonical_id=normalized_target,
    )

    config = SearchConfig(
        available_materials=frozenset(aliases.normalize(material) for material in request.available_materials),
        whitelist=frozenset(aliases.normalize(material) for material in request.whitelist),
        blacklist=material_blacklist,
        machine_blacklist=machine_blacklist,
        max_depth=request.max_depth,
        max_trees=request.max_trees,
        max_branching_per_material=request.max_branching_per_material,
        max_nodes_per_tree=request.max_nodes_per_tree,
        enable_surplus_reuse=request.enable_surplus_reuse,
    )

    result = solve_target(
        target=target_key,
        target_amount=request.target_amount,
        output_index=app_state["output_index"],
        config=config,
    )
    result["request"]["blacklist"] = request.blacklist
    return Response(content=json.dumps(result, ensure_ascii=False), media_type="application/json")


@app.get("/api/status", summary="Get backend status")
def status():
    output_index = app_state["output_index"]
    if not output_index:
        return {"status": "uninitialized"}

    return {
        "status": "ok",
        "recipes_indexed": sum(len(value) for value in output_index.values()),
    }


@app.get("/api/materials", summary="List known materials")
def get_materials():
    return app_state.get("all_materials", [])


@app.get("/api/machines", summary="List known machine types")
def get_machines():
    return app_state.get("machine_catalog", [])


@app.get("/api/recipes/files", summary="List loaded recipe files")
def list_recipe_files():
    files = [path.name for path in RECIPES_DIR.glob("*.json")]
    return {"files": files}


@app.post("/api/recipes/upload", summary="Upload recipe files")
def upload_recipe_files(files: list[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    saved_files: list[str] = []
    for file in files:
        if file.filename and file.filename.endswith(".json"):
            file_path = RECIPES_DIR / file.filename
            with file_path.open("wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_files.append(file.filename)

    if not saved_files:
        raise HTTPException(status_code=400, detail="No valid .json files uploaded")

    reload_recipes()
    return {"status": "ok", "files": saved_files}


@app.delete("/api/recipes/files/{filename}", summary="Delete a recipe file")
def delete_recipe_file(filename: str):
    file_path = RECIPES_DIR / filename
    if file_path.exists() and file_path.is_file():
        file_path.unlink()
        reload_recipes()
        return {"status": "ok"}

    raise HTTPException(status_code=404, detail="File not found")


ui_path = Path(__file__).parent.parent.parent.parent / "recipe_pathfinder_frontend" / "dist"
if ui_path.exists() and ui_path.is_dir():
    app.mount("/", StaticFiles(directory=str(ui_path), html=True), name="ui")
else:  # pragma: no cover - environment dependent
    print(f"Watch Out: Frontend build not found at {ui_path}. Web UI will not be served.")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("recipe_pathfinder_backend.server:app", host="127.0.0.1", port=8000, reload=True)
