import type { PresetGroup, PresetKind } from './types';

const STORAGE_KEYS: Record<PresetKind, string> = {
  materials: 'gtp_material_groups',
  whitelist: 'gtp_whitelist_groups',
  blacklist: 'gtp_blacklist_groups',
};

const createPresetId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `preset-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const normalizeEntries = (entries: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const entry of entries) {
    const value = entry.trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
};

export const parseEntriesFromPlainText = (text: string): string[] => {
  return normalizeEntries(text.split(/\r?\n/));
};

export const appendEntries = (current: string[], incoming: string[]): string[] => {
  return normalizeEntries([...current, ...incoming]);
};

export const entriesToPlainText = (entries: string[]): string => {
  return normalizeEntries(entries).join('\n');
};

export const loadPresetGroups = (kind: PresetKind): PresetGroup[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[kind]);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (group): group is PresetGroup =>
          typeof group?.id === 'string'
          && typeof group?.name === 'string'
          && Array.isArray(group?.entries),
      )
      .map((group) => ({
        ...group,
        entries: normalizeEntries(group.entries),
      }));
  } catch {
    return [];
  }
};

export const savePresetGroups = (kind: PresetKind, groups: PresetGroup[]): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEYS[kind], JSON.stringify(groups));
};

export const createPresetGroup = (name: string, entries: string[]): PresetGroup => {
  return {
    id: createPresetId(),
    name: name.trim(),
    entries: normalizeEntries(entries),
  };
};
