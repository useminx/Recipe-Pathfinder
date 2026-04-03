import type { LocalizationPack } from './types';

const STORAGE_KEY = 'gtp_localization_packs';
const RAW_ID_PREFIXES = new Set(['material', 'item', 'block', 'fluid']);

export const sanitizeLanguagePackEntries = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Language pack JSON must be a plain object.');
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([key, entryValue]) => [key, stripMinecraftFormatting(entryValue)]),
  );
};

export const parseLanguagePackText = (text: string, fileName: string): Record<string, string> => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Unable to parse language pack ${fileName}.`);
  }

  let entries: Record<string, string>;
  try {
    entries = sanitizeLanguagePackEntries(parsed);
  } catch {
    throw new Error(`Language pack ${fileName} must be a plain object.`);
  }

  if (Object.keys(entries).length === 0) {
    throw new Error(`Language pack ${fileName} has no usable string entries.`);
  }

  return normalizeLanguagePackEntries(entries);
};

const normalizeLanguagePackEntries = (entries: Record<string, string>): Record<string, string> => {
  const normalized: Record<string, string> = {};

  for (const [key, value] of Object.entries(entries)) {
    normalized[key] = value;

    const rawId = normalizeLanguageKeyToRawId(key);
    if (rawId && !(rawId in normalized)) {
      normalized[rawId] = value;
    }
  }

  return normalized;
};

const normalizeLanguageKeyToRawId = (key: string): string | null => {
  const segments = key.split('.');
  if (segments.length === 2) {
    const [namespace, path] = segments;
    if (!RESOURCE_LOCATION_SEGMENT.test(namespace) || !RESOURCE_LOCATION_SEGMENT.test(path)) {
      return null;
    }

    return `${namespace}:${path}`;
  }

  if (segments.length !== 3) {
    return null;
  }

  const [prefix, namespace, path] = segments;
  if (!RAW_ID_PREFIXES.has(prefix)) {
    return null;
  }

  if (!RESOURCE_LOCATION_SEGMENT.test(namespace) || !RESOURCE_LOCATION_SEGMENT.test(path)) {
    return null;
  }

  return `${namespace}:${path}`;
};

const RESOURCE_LOCATION_SEGMENT = /^[a-z0-9_/-]+$/;
const MINECRAFT_FORMATTING_CODE = /§./g;

const stripMinecraftFormatting = (value: string): string => value.replace(MINECRAFT_FORMATTING_CODE, '').trim();

export const createLocalizationPack = (
  fileName: string,
  translations: Record<string, string>,
  uploadOrder: number,
): LocalizationPack => ({
  id: `pack-${uploadOrder}-${fileName}`,
  name: fileName.replace(/\.json$/i, ''),
  fileName,
  uploadOrder,
  entryCount: Object.keys(translations).length,
  translations: { ...translations },
});

const normalizeLocalizationPack = (value: unknown): LocalizationPack | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const pack = value as Partial<LocalizationPack>;
  if (
    typeof pack.id !== 'string' ||
    typeof pack.name !== 'string' ||
    typeof pack.fileName !== 'string' ||
    typeof pack.uploadOrder !== 'number' ||
    !pack.translations
  ) {
    return null;
  }

  let translations: Record<string, string>;
  try {
    translations = normalizeLanguagePackEntries(sanitizeLanguagePackEntries(pack.translations));
  } catch {
    return null;
  }

  return {
    id: pack.id,
    name: pack.name,
    fileName: pack.fileName,
    uploadOrder: pack.uploadOrder,
    entryCount: Object.keys(translations).length,
    translations,
  };
};

export const loadLocalizationPacks = (): LocalizationPack[] => {
  if (typeof localStorage === 'undefined') {
    return [];
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(normalizeLocalizationPack).filter((pack): pack is LocalizationPack => pack !== null);
  } catch {
    return [];
  }
};

export const saveLocalizationPacks = (packs: LocalizationPack[]): void => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
};

export const buildMergedLocalizationMap = (
  builtIn: Record<string, string>,
  packs: LocalizationPack[],
): Record<string, string> => {
  const merged: Record<string, string> = { ...builtIn };

  for (const pack of [...packs].sort((left, right) => left.uploadOrder - right.uploadOrder)) {
    for (const [key, value] of Object.entries(pack.translations)) {
      if (!(key in merged)) {
        merged[key] = value;
      }
    }
  }

  return merged;
};
