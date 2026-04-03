import type { MachineCatalogEntry, PathfinderResponse, PathfinderRequest } from './types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:8000' : '';

export interface UploadRecipeFilesResponse {
  status: 'ok';
  files: string[];
}

export interface StatusResponse {
  status: 'ok';
}

const readErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const data = await response.json();
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
    if (typeof data?.message === 'string') {
      return data.message;
    }
  } catch {
    const text = await response.text().catch(() => '');
    if (text) {
      return text;
    }
  }

  return fallback;
};

export const solveRecipeTree = async (params: PathfinderRequest): Promise<PathfinderResponse> => {
  const response = await fetch(`${API_BASE}/api/solve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API Request failed (${response.status}): ${errText}`);
  }

  return response.json();
};

export const fetchMaterials = async (): Promise<string[]> => {
  const response = await fetch(`${API_BASE}/api/materials`);
  if (!response.ok) {
    throw new Error('Failed to fetch materials');
  }
  return response.json();
};

export const fetchMachines = async (): Promise<MachineCatalogEntry[]> => {
  const response = await fetch(`${API_BASE}/api/machines`);
  if (!response.ok) {
    throw new Error('Failed to fetch machines');
  }
  return response.json();
};

export const fetchRecipeFiles = async (): Promise<string[]> => {
  const response = await fetch(`${API_BASE}/api/recipes/files`);
  if (!response.ok) throw new Error('Failed to fetch files');
  const data = await response.json();
  return data.files || [];
};

export const uploadRecipeFiles = async (
  files: FileList | File[],
): Promise<UploadRecipeFilesResponse> => {
  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append('files', file));
  const response = await fetch(`${API_BASE}/api/recipes/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '上传失败'));
  }
  return response.json();
};

export const deleteRecipeFile = async (filename: string): Promise<StatusResponse> => {
  const response = await fetch(`${API_BASE}/api/recipes/files/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, '删除失败'));
  }
  return response.json();
};
