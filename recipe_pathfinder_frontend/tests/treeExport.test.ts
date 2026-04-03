import { describe, expect, it } from 'vitest';
import { buildTreeExportFilename, buildTreeExportPayload } from '../src/treeExport';

const response = {
  request: {
    target: 'gtceu:lv_machine_hull',
    target_kind: 'item',
    target_amount: 1,
    available_materials: ['gtceu:steel_dust'],
    whitelist: [],
    blacklist: [],
    max_depth: 64,
    max_trees: 32,
    max_branching_per_material: 20,
    max_nodes_per_tree: 100,
    enable_surplus_reuse: false,
  },
  summary: {
    tree_count: 2,
    fully_resolved_count: 1,
    partially_resolved_count: 1,
    cycle_cut_count: 0,
    blacklist_cut_count: 0,
    no_recipe_count: 0,
    max_depth_cut_count: 0,
    surplus_satisfied_count: 0,
    search_duration_ms: 9,
  },
  trees: [
    {
      status: 'fully_resolved',
      status_reasons: [],
      metrics: {
        step_count: 1,
        total_duration: 10,
        total_eut: 16,
        surplus_satisfied_count: 0,
        failure_count: 0,
      },
      children: [],
    },
    {
      status: 'partially_resolved',
      status_reasons: ['no_recipe'],
      metrics: {
        step_count: 1,
        total_duration: 20,
        total_eut: 32,
        surplus_satisfied_count: 0,
        failure_count: 1,
      },
      children: [],
    },
  ],
} as const;

describe('buildTreeExportPayload', () => {
  it('exports one selected tree with request context only', () => {
    const payload = buildTreeExportPayload(response, 1);

    expect(payload.tree_index).toBe(1);
    expect(payload.request.target).toBe('gtceu:lv_machine_hull');
    expect(payload.tree.status).toBe('partially_resolved');
    expect('trees' in payload).toBe(false);
    expect(payload.tree.metrics.total_eut).toBe(32);
  });
});

describe('buildTreeExportFilename', () => {
  it('creates deterministic filenames', () => {
    expect(buildTreeExportFilename('gtceu:lv_machine_hull', 1)).toBe('gtceu-lv_machine_hull-tree-2.json');
  });
});
