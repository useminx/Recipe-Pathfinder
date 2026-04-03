import { BUILT_IN_LOCALIZATION, type LocalizationMap } from './materialLocalization';
import type { MachineCatalogEntry, MaterialSuggestion } from './types';

const localize = (key: string | null | undefined, names: LocalizationMap): string | null => {
  if (!key) {
    return null;
  }
  return names[key] ?? null;
};

export function getMachineDisplayName(
  recipeId: string,
  machineType: string,
  names: LocalizationMap = BUILT_IN_LOCALIZATION,
  tier: string | null = null,
): string {
  const [recipeNamespace = '', recipePath = ''] = recipeId.split(':');
  const machineSegment = recipePath.split('/')[0] || machineType;
  const machineTypeSegment = machineType.includes(':') ? machineType.split(':').pop() || machineType : machineType;
  const tierPrefixes = buildTierPrefixes(tier);
  const namespaceCandidates = buildNamespaceCandidates(recipeNamespace);
  const candidates = [
    ...namespaceCandidates.flatMap((namespace) =>
      tierPrefixes.flatMap((tierPrefix) => [
        `${namespace}:${tierPrefix}_${machineSegment}`,
        `${namespace}:${tierPrefix}_${machineTypeSegment}`,
      ]),
    ),
    ...namespaceCandidates.flatMap((namespace) => [
      `${namespace}:${machineSegment}`,
      `${namespace}:${machineTypeSegment}`,
    ]),
    machineSegment,
    machineTypeSegment,
  ];

  for (const candidate of candidates) {
    const localized = localize(candidate, names);
    if (localized) {
      return localized;
    }
  }

  return machineSegment ?? machineTypeSegment ?? machineType;
}

const buildTierPrefixes = (tier: string | null): string[] => {
  if (!tier) {
    return [];
  }

  const normalized = tier.trim().toLowerCase();
  if (!normalized || normalized === 'no energy') {
    return [];
  }

  if (normalized === 'ulv') {
    return ['ulv', 'lv'];
  }

  return [normalized];
};

const buildNamespaceCandidates = (recipeNamespace: string): string[] => {
  if (!recipeNamespace) {
    return [];
  }

  if (recipeNamespace === 'gtceu') {
    return ['gtceu', 'gtocore'];
  }

  return [recipeNamespace];
};

export function getVoltageTier(eut: number): string {
  if (eut <= 0) return 'No Energy';
  if (eut <= 8) return 'ULV';
  if (eut <= 32) return 'LV';
  if (eut <= 128) return 'MV';
  if (eut <= 512) return 'HV';
  if (eut <= 2048) return 'EV';
  if (eut <= 8192) return 'IV';
  if (eut <= 32768) return 'LuV';
  if (eut <= 131072) return 'ZPM';
  if (eut <= 524288) return 'UV';
  if (eut <= 2097152) return 'UHV';
  if (eut <= 8388608) return 'UEV';
  if (eut <= 33554432) return 'UIV';
  if (eut <= 134217728) return 'UXV';
  return 'OpV';
}

export function buildMachineSuggestions(
  machines: MachineCatalogEntry[],
  names: LocalizationMap = BUILT_IN_LOCALIZATION,
): MaterialSuggestion[] {
  return machines.map((machine) => {
    const localized = getMachineDisplayName(
      machine.recipe_id,
      machine.machine_type,
      names,
      getVoltageTier(machine.eut),
    );
    const inputValue = `@${machine.machine_type.toLowerCase()}`;

    return {
      rawId: inputValue,
      namespace: 'machine',
      primaryLabel: localized,
      secondaryLabel: inputValue,
      hasBuiltInChinese: localized !== machine.machine_type,
      kind: 'machine',
    };
  });
}

export function formatMachineBlacklistDisplay(
  entry: string,
  suggestions: MaterialSuggestion[],
  names: LocalizationMap = BUILT_IN_LOCALIZATION,
): { primaryLabel: string; secondaryLabel?: string } {
  const normalized = entry.trim().toLowerCase();
  const fromSuggestions = suggestions.find((suggestion) => suggestion.rawId === normalized && suggestion.kind === 'machine');
  if (fromSuggestions) {
    return {
      primaryLabel: `机器 · ${fromSuggestions.primaryLabel}`,
      secondaryLabel: fromSuggestions.secondaryLabel,
    };
  }

  const rawMachine = normalized.startsWith('@') ? normalized.slice(1) : normalized;
  if (rawMachine.includes(':') && rawMachine.includes('/')) {
    const [recipeId] = [rawMachine];
    const machineType = recipeId.split(':')[1]?.split('/')[0] || rawMachine;
    return {
      primaryLabel: `机器 · ${getMachineDisplayName(recipeId, machineType, names)}`,
      secondaryLabel: `@${rawMachine}`,
    };
  }

  return {
    primaryLabel: `机器 · ${rawMachine}`,
    secondaryLabel: `@${rawMachine}`,
  };
}
