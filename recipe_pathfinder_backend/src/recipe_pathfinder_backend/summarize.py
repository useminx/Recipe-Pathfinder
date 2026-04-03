from __future__ import annotations


def summarize_result(result: dict, elapsed_ms: float) -> dict:
    summary = {
        "tree_count": len(result["trees"]),
        "fully_resolved_count": 0,
        "partially_resolved_count": 0,
        "cycle_cut_count": 0,
        "blacklist_cut_count": 0,
        "no_recipe_count": 0,
        "max_depth_cut_count": 0,
        "surplus_satisfied_count": 0,
        "search_duration_ms": round(elapsed_ms, 3),
    }

    failure_statuses = {
        "blacklisted",
        "cycle_detected",
        "max_depth_reached",
        "max_nodes_reached",
        "no_recipe",
    }

    def walk(node: dict) -> tuple[set[str], dict[str, int]]:
        statuses: set[str] = set()
        metrics = {
            "step_count": 0,
            "total_duration": 0,
            "total_eut": 0,
            "surplus_satisfied_count": 0,
            "source_match_count": 0,
            "failure_count": 0,
        }
        status = node.get("status")
        if status in {
            "source_matched",
            "blacklisted",
            "max_depth_reached",
            "cycle_detected",
            "no_recipe",
            "max_nodes_reached",
        }:
            statuses.add(status)
        if status == "satisfied_by_surplus":
            metrics["surplus_satisfied_count"] += 1
        if status == "source_matched":
            metrics["source_match_count"] += 1
        if status in failure_statuses:
            metrics["failure_count"] += 1
        if node.get("node_type") == "recipe_choice":
            metrics["step_count"] += 1
            metrics["total_duration"] += node.get("duration", 0) or 0
            metrics["total_eut"] += node.get("eut", 0) or 0
        for child in node.get("children", []):
            child_statuses, child_metrics = walk(child)
            if status != "max_nodes_reached":
                statuses.update(child_statuses)
            for key, value in child_metrics.items():
                metrics[key] += value
        return statuses, metrics

    for tree in result["trees"]:
        statuses, metrics = walk(tree)
        tree["metrics"] = metrics
        if statuses <= {"source_matched"}:
            summary["fully_resolved_count"] += 1
            tree["status"] = "fully_resolved"
        else:
            summary["partially_resolved_count"] += 1
            tree["status"] = "partially_resolved"
        tree["status_reasons"] = sorted(statuses - {"source_matched"})
        summary["cycle_cut_count"] += int("cycle_detected" in statuses)
        summary["blacklist_cut_count"] += int("blacklisted" in statuses)
        summary["no_recipe_count"] += int("no_recipe" in statuses)
        summary["max_depth_cut_count"] += int("max_depth_reached" in statuses)
        summary["surplus_satisfied_count"] += metrics["surplus_satisfied_count"]

    return summary
