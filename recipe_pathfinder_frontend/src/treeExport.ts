import type { PathfinderResponse, TreeExportPayload } from './types';

export const buildTreeExportPayload = (
  response: PathfinderResponse,
  treeIndex: number,
): TreeExportPayload => {
  const tree = response.trees[treeIndex];

  if (!tree) {
    throw new Error('Selected tree does not exist.');
  }

  return {
    exported_at: new Date().toISOString(),
    request: response.request,
    tree_index: treeIndex,
    tree,
  };
};

export const buildTreeExportFilename = (target: string, treeIndex: number): string =>
  `${target.replace(/[^a-zA-Z0-9:_-]+/g, '-').replace(/:/g, '-')}-tree-${treeIndex + 1}.json`;

export const downloadTreeExport = (response: PathfinderResponse, treeIndex: number): void => {
  const payload = buildTreeExportPayload(response, treeIndex);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = buildTreeExportFilename(response.request.target, treeIndex);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
