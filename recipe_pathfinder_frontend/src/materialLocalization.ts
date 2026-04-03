import localizedNames from './generated/gtceuZhCn.generated.json' with { type: 'json' };
import type { MaterialSuggestion } from './types';

export type LocalizationMap = Record<string, string>;
export const BUILT_IN_LOCALIZATION = localizedNames as LocalizationMap;

const namespaceOf = (rawId: string): string => rawId.split(':')[0] || '';

const MATERIAL_QUALITY_PREFIXES: Array<[prefix: string, chinesePrefix: string]> = [
  ['chipped_', '破碎的'],
  ['flawed_', '有瑕的'],
  ['flawless_', '无瑕的'],
  ['exquisite_', '精致的'],
];

const MATERIAL_FORM_SUFFIXES: Array<[suffix: string, chineseSuffix: string]> = [
  ['_fine_wire', '细线'],
  ['_round', '圆棒'],
  ['_spring_small', '小弹簧'],
  ['_small_gear', '小齿轮'],
  ['_long_rod', '长杆'],
  ['_foil', '箔'],
  ['_gear', '齿轮'],
  ['_frame', '框架'],
  ['_spring', '弹簧'],
  ['_dust', '粉'],
  ['_ingot', '锭'],
  ['_nugget', '粒'],
  ['_plate', '板'],
  ['_rod', '杆'],
  ['_screw', '螺丝'],
  ['_bolt', '螺栓'],
  ['_ring', '环'],
  ['_wire', '线'],
  ['_gem', '宝石'],
  ['_cell', '单元'],
];

export const hasLocalizedName = (
  rawId: string,
  names: LocalizationMap = BUILT_IN_LOCALIZATION,
): boolean => Object.prototype.hasOwnProperty.call(names, rawId);

export const formatMaterialDisplay = (
  rawId: string,
  names: LocalizationMap = BUILT_IN_LOCALIZATION,
) => {
  const localized = resolveLocalizedMaterialName(rawId, names);

  if (!localized) {
    return {
      rawId,
      namespace: namespaceOf(rawId),
      primaryLabel: rawId,
      secondaryLabel: undefined,
      hasBuiltInChinese: false,
    };
  }

  return {
    rawId,
    namespace: namespaceOf(rawId),
    primaryLabel: localized,
    secondaryLabel: rawId,
    hasBuiltInChinese: true,
  };
};

const resolveLocalizedMaterialName = (
  rawId: string,
  names: LocalizationMap,
): string | undefined => {
  if (hasLocalizedName(rawId, names)) {
    return names[rawId];
  }

  const derived = deriveMaterialFormLabel(rawId, names);
  return derived ?? undefined;
};

const deriveMaterialFormLabel = (
  rawId: string,
  names: LocalizationMap,
): string | null => {
  const [namespace, path] = rawId.split(':');
  if (!namespace || !path) {
    return null;
  }

  if (namespace !== 'gtceu' && namespace !== 'forge') {
    return null;
  }

  for (const [suffix, chineseSuffix] of MATERIAL_FORM_SUFFIXES) {
    if (!path.endsWith(suffix)) {
      continue;
    }

    const materialBase = path.slice(0, -suffix.length);
    if (!materialBase) {
      return null;
    }

    const translatedBase =
      names[`${namespace}:${materialBase}`] ??
      names[`gtceu:${materialBase}`] ??
      names[`forge:${materialBase}`];

    if (translatedBase) {
      return `${translatedBase}${chineseSuffix}`;
    }

    for (const [qualityPrefix, chineseQualityPrefix] of MATERIAL_QUALITY_PREFIXES) {
      if (!materialBase.startsWith(qualityPrefix)) {
        continue;
      }

      const qualityBase = materialBase.slice(qualityPrefix.length);
      if (!qualityBase) {
        return null;
      }

      const translatedQualityBase =
        names[`${namespace}:${qualityBase}`] ??
        names[`gtceu:${qualityBase}`] ??
        names[`forge:${qualityBase}`];

      if (translatedQualityBase) {
        return `${chineseQualityPrefix}${translatedQualityBase}${chineseSuffix}`;
      }
    }

    if (materialBase.startsWith('small_')) {
      const smallBase = materialBase.slice('small_'.length);
      if (!smallBase) {
        return null;
      }

      const translatedSmallBase =
        names[`${namespace}:${smallBase}`] ??
        names[`gtceu:${smallBase}`] ??
        names[`forge:${smallBase}`];

      if (translatedSmallBase) {
        const sizePrefix = suffix === '_dust' ? '小堆' : '小';
        return `${sizePrefix}${translatedSmallBase}${chineseSuffix}`;
      }
    }
  }

  return null;
};

export const formatInlineMaterialDisplay = (
  rawId: string,
  names: LocalizationMap = BUILT_IN_LOCALIZATION,
) => formatMaterialDisplay(rawId, names);

export const buildMaterialSuggestions = (
  rawIds: string[],
  names: LocalizationMap = BUILT_IN_LOCALIZATION,
): MaterialSuggestion[] => {
  return rawIds.map((rawId) => {
    const display = formatMaterialDisplay(rawId, names);

    return {
      rawId,
      namespace: display.namespace,
      primaryLabel: display.primaryLabel,
      secondaryLabel: display.secondaryLabel,
      hasBuiltInChinese: display.hasBuiltInChinese,
    };
  });
};

export const searchMaterialSuggestions = (
  suggestions: MaterialSuggestion[],
  query: string,
): MaterialSuggestion[] => {
  const trimmed = query.trim();

  if (trimmed.startsWith('#')) {
    const englishQuery = trimmed.slice(1).toLowerCase();

    return suggestions
      .map((entry) => ({
        entry,
        score: relevanceScore(entry.rawId.toLowerCase(), englishQuery),
      }))
      .filter(({ score }) => score !== null)
      .sort((left, right) => compareSearchHits(left.score, right.score, left.entry.rawId, right.entry.rawId))
      .map(({ entry }) => entry)
      .slice(0, 50);
  }

  const chineseQuery = trimmed.toLowerCase();

  return suggestions
    .map((entry) => ({
      entry,
      score: entry.hasBuiltInChinese ? relevanceScore(entry.primaryLabel.toLowerCase(), chineseQuery) : null,
    }))
    .filter(({ score }) => score !== null)
    .sort((left, right) => compareSearchHits(left.score, right.score, left.entry.rawId, right.entry.rawId))
    .map(({ entry }) => entry)
    .slice(0, 50);
};

const relevanceScore = (haystack: string, needle: string): number | null => {
  if (!needle) {
    return 0;
  }

  if (haystack === needle) {
    return 0;
  }

  if (haystack.startsWith(needle)) {
    return 1;
  }

  if (haystack.includes(needle)) {
    return 2;
  }

  return null;
};

const compareSearchHits = (
  leftScore: number | null,
  rightScore: number | null,
  leftRawId: string,
  rightRawId: string,
): number => {
  if (leftScore !== rightScore) {
    return (leftScore ?? Number.POSITIVE_INFINITY) - (rightScore ?? Number.POSITIVE_INFINITY);
  }

  return leftRawId.localeCompare(rightRawId);
};
