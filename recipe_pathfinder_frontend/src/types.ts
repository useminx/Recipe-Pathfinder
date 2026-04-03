export interface PathfinderRequest {
  target: string;
  target_kind: string;
  target_amount: number;
  available_materials: string[];
  whitelist: string[];
  blacklist: string[];
  max_depth: number;
  max_trees: number;
  max_branching_per_material: number;
  max_nodes_per_tree: number;
  enable_surplus_reuse: boolean;
}

export type PresetKind = 'materials' | 'whitelist' | 'blacklist';

export interface PresetGroup {
  id: string;
  name: string;
  entries: string[];
}

export interface MaterialSuggestion {
  rawId: string;
  namespace: string;
  primaryLabel: string;
  secondaryLabel?: string;
  hasBuiltInChinese: boolean;
  kind?: 'material' | 'machine';
}

export interface MachineCatalogEntry {
  machine_type: string;
  recipe_id: string;
  eut: number;
}

export interface LocalizationPack {
  id: string;
  name: string;
  fileName: string;
  uploadOrder: number;
  entryCount: number;
  translations: Record<string, string>;
}

export interface PathfinderSummary {
  tree_count: number;
  fully_resolved_count: number;
  partially_resolved_count: number;
  cycle_cut_count: number;
  blacklist_cut_count: number;
  no_recipe_count: number;
  max_depth_cut_count: number;
  surplus_satisfied_count: number;
  search_duration_ms: number;
}

export interface TreeMetrics {
  step_count: number;
  total_duration: number;
  total_eut: number;
  surplus_satisfied_count: number;
  failure_count: number;
}

export interface MaterialNeedNode {
  node_type: 'material_need';
  material: string;
  required_amount: number;
  status: 'expanded' | 'source_matched' | 'blacklisted' | 'no_recipe' | 'cycle_detected' | 'max_depth_reached' | 'max_nodes_reached' | 'satisfied_by_surplus';
  // If satisfied by surplus
  satisfied_amount?: number;
  remaining_amount?: number;
  source_recipe_id?: string;
  children?: RecipeChoiceNode[];
}

export interface RecipeIO {
  material: string;
  amount: number;
  chance?: number;
}

export interface RecipeChoiceNode {
  node_type: 'recipe_choice';
  recipe_id: string;
  recipe_type: string;
  machine_type: string;
  duration: number;
  eut: number;
  runs: number;
  primary_output: string;
  surplus?: Record<string, number>;
  inputs: RecipeIO[];
  outputs: RecipeIO[];
  children?: MaterialNeedNode[];
}

export type PathfinderNode = MaterialNeedNode | RecipeChoiceNode;

export interface PathfinderTree {
  status: 'fully_resolved' | 'partially_resolved' | 'failed';
  status_reasons: string[];
  metrics: TreeMetrics;
  children: RecipeChoiceNode[];
}

export interface PathfinderResponse {
  request: PathfinderRequest;
  summary: PathfinderSummary;
  trees: PathfinderTree[];
}

export interface TreeExportPayload {
  exported_at: string;
  request: PathfinderRequest;
  tree_index: number;
  tree: PathfinderTree;
}
