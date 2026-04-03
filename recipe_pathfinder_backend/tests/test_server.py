import io

from fastapi.testclient import TestClient

from recipe_pathfinder_backend import server


def _recipe_doc(recipe_id: str, output_item: str, input_item: str) -> bytes:
    payload = f"""
    [
      {{
        "id": "{recipe_id}",
        "namespace": "gtceu",
        "type": "Recipe",
        "recipeType": "assembler",
        "duration": 20,
        "EUt": 8,
        "inputs": [{{"item": "{input_item}", "type": "item", "count": 1}}],
        "outputs": [{{"item": "{output_item}", "type": "item", "count": 1}}]
      }}
    ]
    """
    return payload.encode("utf-8")


def _fluid_recipe_doc(recipe_id: str, output_fluid: str, input_fluid: str) -> bytes:
    payload = f"""
    [
      {{
        "id": "{recipe_id}",
        "namespace": "gtceu",
        "type": "Recipe",
        "recipeType": "chemical_reactor",
        "duration": 100,
        "EUt": 480,
        "inputs": [{{"fluid": "{input_fluid}", "type": "fluid", "amount": 1000}}],
        "outputs": [{{"fluid": "{output_fluid}", "type": "fluid", "amount": 1000}}]
      }}
    ]
    """
    return payload.encode("utf-8")


def test_uploading_multiple_recipe_files_refreshes_file_list_and_material_index(
    tmp_path, monkeypatch
):
    recipes_dir = tmp_path / "recipes"
    recipes_dir.mkdir()
    (recipes_dir / "seed.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(server, "RECIPES_DIR", recipes_dir)
    server.app_state["output_index"] = None
    server.app_state["all_materials"] = []

    with TestClient(server.app) as client:
        response = client.post(
            "/api/recipes/upload",
            files=[
                (
                    "files",
                    (
                        "alpha.json",
                        io.BytesIO(
                            _recipe_doc("mod:alpha", "mod:plate_a", "mod:ore_a")
                        ),
                        "application/json",
                    ),
                ),
                (
                    "files",
                    (
                        "beta.json",
                        io.BytesIO(
                            _recipe_doc("mod:beta", "mod:plate_b", "mod:ore_b")
                        ),
                        "application/json",
                    ),
                ),
            ],
        )

        assert response.status_code == 200
        assert response.json() == {
            "status": "ok",
            "files": ["alpha.json", "beta.json"],
        }
        assert set(client.get("/api/recipes/files").json()["files"]) >= {
            "alpha.json",
            "beta.json",
        }
        materials = client.get("/api/materials").json()
        assert "mod:ore_a" in materials
        assert "mod:plate_b" in materials


def test_solve_infers_fluid_target_when_only_fluid_recipe_exists(tmp_path, monkeypatch):
    recipes_dir = tmp_path / "recipes"
    recipes_dir.mkdir()
    (recipes_dir / "seed.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(server, "RECIPES_DIR", recipes_dir)
    server.app_state["output_index"] = None
    server.app_state["all_materials"] = []

    with TestClient(server.app) as client:
        upload = client.post(
            "/api/recipes/upload",
            files=[
                (
                    "files",
                    (
                        "fluid_only.json",
                        io.BytesIO(
                            _fluid_recipe_doc(
                                "mod:chemical/fluid_target",
                                "mod:dimethylhydrazine",
                                "mod:methanol",
                            )
                        ),
                        "application/json",
                    ),
                )
            ],
        )

        assert upload.status_code == 200

        response = client.post(
            "/api/solve",
            json={
                "target": "mod:dimethylhydrazine",
                "target_kind": "item",
                "target_amount": 1,
                "available_materials": ["mod:methanol"],
                "whitelist": [],
                "blacklist": [],
                "max_depth": 64,
                "max_trees": 32,
                "max_branching_per_material": 20,
                "max_nodes_per_tree": 100,
                "enable_surplus_reuse": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["request"]["target_kind"] == "fluid"
        assert data["summary"]["fully_resolved_count"] == 1
        assert data["trees"][0]["status"] == "fully_resolved"
        assert data["trees"][0]["children"][0]["recipe_id"] == "mod:chemical/fluid_target"


def test_solve_matches_gtceu_selected_sources_against_forge_recipe_inputs(tmp_path, monkeypatch):
    recipes_dir = tmp_path / "recipes"
    recipes_dir.mkdir()
    (recipes_dir / "seed.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(server, "RECIPES_DIR", recipes_dir)
    server.app_state["output_index"] = None
    server.app_state["all_materials"] = []

    forge_recipe = """
    [
      {
        "id": "mod:chemical/gtceu_methanol_counterpart",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "chemical_reactor",
        "duration": 10,
        "EUt": 30,
        "inputs": [{"fluid": "mod:seed_a", "type": "fluid", "amount": 1000}],
        "outputs": [{"fluid": "gtceu:methanol", "type": "fluid", "amount": 1000}]
      },
      {
        "id": "mod:chemical/gtceu_hypochlorous_counterpart",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "chemical_reactor",
        "duration": 10,
        "EUt": 30,
        "inputs": [{"fluid": "mod:seed_b", "type": "fluid", "amount": 1000}],
        "outputs": [{"fluid": "gtceu:hypochlorous_acid", "type": "fluid", "amount": 1000}]
      },
      {
        "id": "mod:chemical/dimethylhydrazine",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "chemical_reactor",
        "duration": 100,
        "EUt": 480,
        "inputs": [
          {"fluid": "forge:methanol", "type": "fluid", "amount": 1000},
          {"fluid": "forge:hypochlorous_acid", "type": "fluid", "amount": 1000},
          {"fluid": "forge:missing", "type": "fluid", "amount": 1000}
        ],
        "outputs": [{"fluid": "gtceu:dimethylhydrazine", "type": "fluid", "amount": 1000}]
      },
      {
        "id": "mod:chemical/unrelated",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "chemical_reactor",
        "duration": 80,
        "EUt": 120,
        "inputs": [
          {"fluid": "forge:dimethylamine", "type": "fluid", "amount": 1000},
          {"fluid": "forge:monochloramine", "type": "fluid", "amount": 1000}
        ],
        "outputs": [{"fluid": "gtceu:dimethylhydrazine", "type": "fluid", "amount": 1000}]
      }
    ]
    """.encode("utf-8")

    with TestClient(server.app) as client:
        upload = client.post(
            "/api/recipes/upload",
            files=[
                (
                    "files",
                    (
                        "forge_alias.json",
                        io.BytesIO(forge_recipe),
                        "application/json",
                    ),
                )
            ],
        )
        assert upload.status_code == 200

        response = client.post(
            "/api/solve",
            json={
                "target": "gtceu:dimethylhydrazine",
                "target_kind": "fluid",
                "target_amount": 1,
                "available_materials": ["gtceu:methanol", "gtceu:hypochlorous_acid"],
                "whitelist": [],
                "blacklist": [],
                "max_depth": 64,
                "max_trees": 10,
                "max_branching_per_material": 20,
                "max_nodes_per_tree": 100,
                "enable_surplus_reuse": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert [tree["children"][0]["recipe_id"] for tree in data["trees"]] == [
            "mod:chemical/dimethylhydrazine"
        ]
        children = data["trees"][0]["children"][0]["children"]
        assert [child["status"] for child in children] == [
            "source_matched",
            "source_matched",
            "no_recipe",
        ]


def test_solve_matches_gtceu_selected_sources_against_ad_astra_recipe_chain(tmp_path, monkeypatch):
    recipes_dir = tmp_path / "recipes"
    recipes_dir.mkdir()
    (recipes_dir / "seed.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(server, "RECIPES_DIR", recipes_dir)
    server.app_state["output_index"] = None
    server.app_state["all_materials"] = []

    ad_astra_chain = """
    [
      {
        "id": "mod:lathe/steel_to_rod",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "lathe",
        "duration": 20,
        "EUt": 16,
        "inputs": [{"item": "ad_astra:steel_ingot", "type": "item", "count": 1}],
        "outputs": [{"item": "ad_astra:steel_rod", "type": "item", "count": 2}]
      },
      {
        "id": "mod:assembler/steel_frame",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "assembler",
        "duration": 64,
        "EUt": 7,
        "inputs": [
          {"item": "ad_astra:steel_rod", "type": "item", "count": 4},
          {"item": "gtceu:programmed_circuit", "type": "item", "count": 1, "chance": 0}
        ],
        "outputs": [{"item": "gtceu:steel_frame", "type": "item", "count": 1}]
      },
      {
        "id": "mod:placeholder/steel_frame_anchor",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "assembler",
        "duration": 5,
        "EUt": 1,
        "inputs": [{"item": "mod:seed", "type": "item", "count": 1}],
        "outputs": [{"item": "gtceu:steel_frame", "type": "item", "count": 1}]
      }
    ]
    """.encode("utf-8")

    with TestClient(server.app) as client:
        upload = client.post(
            "/api/recipes/upload",
            files=[
                (
                    "files",
                    (
                        "ad_astra_alias.json",
                        io.BytesIO(ad_astra_chain),
                        "application/json",
                    ),
                )
            ],
        )
        assert upload.status_code == 200

        response = client.post(
            "/api/solve",
            json={
                "target": "gtceu:steel_frame",
                "target_kind": "item",
                "target_amount": 1,
                "available_materials": ["gtceu:steel_ingot"],
                "whitelist": [],
                "blacklist": [],
                "max_depth": 8,
                "max_trees": 5,
                "max_branching_per_material": 5,
                "max_nodes_per_tree": 100,
                "enable_surplus_reuse": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert [tree["children"][0]["recipe_id"] for tree in data["trees"]] == [
            "mod:assembler/steel_frame"
        ]
        rod_need = data["trees"][0]["children"][0]["children"][0]
        assert rod_need["children"][0]["recipe_id"] == "mod:lathe/steel_to_rod"
        ingot_need = rod_need["children"][0]["children"][0]
        assert ingot_need["status"] == "source_matched"


def test_solve_supports_machine_blacklist_entries_in_shared_blacklist(tmp_path, monkeypatch):
    recipes_dir = tmp_path / "recipes"
    recipes_dir.mkdir()
    (recipes_dir / "seed.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(server, "RECIPES_DIR", recipes_dir)
    server.app_state["output_index"] = None
    server.app_state["all_materials"] = []

    machine_routes = """
    [
      {
        "id": "mod:assembler/blocked_route",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "assembler",
        "duration": 20,
        "EUt": 8,
        "inputs": [{"item": "mod:source", "type": "item", "count": 1}],
        "outputs": [{"item": "mod:target", "type": "item", "count": 1}]
      },
      {
        "id": "mod:lathe/allowed_route",
        "namespace": "mod",
        "type": "Recipe",
        "recipeType": "lathe",
        "duration": 30,
        "EUt": 12,
        "inputs": [{"item": "mod:source", "type": "item", "count": 1}],
        "outputs": [{"item": "mod:target", "type": "item", "count": 1}]
      }
    ]
    """.encode("utf-8")

    with TestClient(server.app) as client:
        upload = client.post(
            "/api/recipes/upload",
            files=[
                (
                    "files",
                    (
                        "machine_blacklist.json",
                        io.BytesIO(machine_routes),
                        "application/json",
                    ),
                )
            ],
        )
        assert upload.status_code == 200

        response = client.post(
            "/api/solve",
            json={
                "target": "mod:target",
                "target_kind": "item",
                "target_amount": 1,
                "available_materials": ["mod:source"],
                "whitelist": [],
                "blacklist": ["@assembler"],
                "max_depth": 8,
                "max_trees": 5,
                "max_branching_per_material": 5,
                "max_nodes_per_tree": 100,
                "enable_surplus_reuse": False,
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["request"]["blacklist"] == ["@assembler"]
        assert [tree["children"][0]["recipe_id"] for tree in data["trees"]] == [
            "mod:lathe/allowed_route"
        ]


def test_machine_catalog_uses_recipe_id_machine_segments_for_gtceu_routes(tmp_path, monkeypatch):
    recipes_dir = tmp_path / "recipes"
    recipes_dir.mkdir()
    (recipes_dir / "seed.json").write_text("[]", encoding="utf-8")
    monkeypatch.setattr(server, "RECIPES_DIR", recipes_dir)
    server.app_state["output_index"] = None
    server.app_state["all_materials"] = []

    machine_doc = """
    [
      {
        "id": "gtceu:chemical_reactor/example",
        "namespace": "gtceu",
        "type": "Recipe",
        "recipeType": "GTRecipe",
        "duration": 40,
        "EUt": 120,
        "inputs": [{"item": "mod:source", "type": "item", "count": 1}],
        "outputs": [{"item": "mod:target", "type": "item", "count": 1}]
      }
    ]
    """.encode("utf-8")

    with TestClient(server.app) as client:
        upload = client.post(
            "/api/recipes/upload",
            files=[
                (
                    "files",
                    (
                        "machine_catalog.json",
                        io.BytesIO(machine_doc),
                        "application/json",
                    ),
                )
            ],
        )
        assert upload.status_code == 200

        response = client.get("/api/machines")
        assert response.status_code == 200
        assert response.json() == [
            {
                "machine_type": "chemical_reactor",
                "recipe_id": "gtceu:chemical_reactor/example",
                "eut": 120,
            }
        ]
