const normalizeMaterialDraft = (draft: string): string => {
  const trimmed = draft.trim();
  return trimmed.startsWith('#') ? trimmed.slice(1).trim() : trimmed;
};

const isEnglishModeDraft = (draft: string): boolean => draft.trim().startsWith('#');

const buildValidRawIdSet = (validRawIds: readonly string[]): Set<string> => new Set(validRawIds);

const normalizeMachineBlacklistDraft = (draft: string): string | null => {
  const trimmed = draft.trim();
  if (!trimmed.startsWith('@')) {
    return null;
  }

  const machineEntry = trimmed.slice(1).trim().toLowerCase();
  if (!machineEntry) {
    return null;
  }

  return `@${machineEntry}`;
};

export const resolveExplicitTargetValue = (
  committedValue: string,
  draftValue: string,
  validRawIds: readonly string[],
): string => {
  if (!isEnglishModeDraft(draftValue)) {
    return committedValue;
  }

  const candidate = normalizeMaterialDraft(draftValue);

  if (buildValidRawIdSet(validRawIds).has(candidate)) {
    return candidate;
  }

  return committedValue;
};

export const resolveExplicitListEntryValue = (
  committedValue: string,
  draftValue: string,
  validRawIds: readonly string[],
  options?: { allowMachineEntries?: boolean },
): string | null => {
  if (options?.allowMachineEntries) {
    const machineEntry = normalizeMachineBlacklistDraft(draftValue);
    if (machineEntry) {
      return machineEntry;
    }
  }

  const validRawIdsSet = buildValidRawIdSet(validRawIds);

  if (!isEnglishModeDraft(draftValue)) {
    return validRawIdsSet.has(committedValue) && draftValue.trim() === committedValue ? committedValue : null;
  }

  const candidate = normalizeMaterialDraft(draftValue);

  if (!validRawIdsSet.has(candidate)) {
    return null;
  }

  return candidate;
};
