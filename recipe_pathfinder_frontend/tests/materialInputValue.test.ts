import { describe, expect, it } from 'vitest';
import {
  resolveExplicitListEntryValue,
  resolveExplicitTargetValue,
} from '../src/materialInputValue';

describe('resolveExplicitTargetValue', () => {
  const validRawIds = ['gtceu:lv_machine_hull', 'modpack:custom_item'];

  it('accepts a manually typed full raw id only in # mode for explicit actions', () => {
    expect(resolveExplicitTargetValue('gtceu:lv_machine_hull', '#modpack:custom_item', validRawIds)).toBe(
      'modpack:custom_item',
    );
  });

  it('rejects a plain untranslated raw id in default Chinese mode', () => {
    expect(resolveExplicitTargetValue('gtceu:lv_machine_hull', 'modpack:custom_item', validRawIds)).toBe(
      'gtceu:lv_machine_hull',
    );
  });

  it('keeps the last committed target when draft text is invalid', () => {
    expect(resolveExplicitTargetValue('gtceu:lv_machine_hull', 'random draft', validRawIds)).toBe(
      'gtceu:lv_machine_hull',
    );
  });
});

describe('resolveExplicitListEntryValue', () => {
  const validRawIds = ['gtceu:red_alloy', 'modpack:custom_item'];

  it('accepts a manually typed full raw id only in # mode for add-entry actions', () => {
    expect(resolveExplicitListEntryValue('', '#modpack:custom_item', validRawIds)).toBe('modpack:custom_item');
  });

  it('rejects a plain untranslated raw id in default Chinese mode', () => {
    expect(resolveExplicitListEntryValue('', 'modpack:custom_item', validRawIds)).toBeNull();
  });

  it('accepts an already committed suggestion selection without requiring # in the draft', () => {
    expect(resolveExplicitListEntryValue('gtceu:red_alloy', 'gtceu:red_alloy', validRawIds)).toBe(
      'gtceu:red_alloy',
    );
  });

  it('does not append stale committed state when the draft is invalid', () => {
    expect(resolveExplicitListEntryValue('gtceu:red_alloy', 'unselected draft', validRawIds)).toBeNull();
  });

  it('never returns a stored raw id with the # mode marker attached', () => {
    expect(resolveExplicitListEntryValue('', '#gtceu:red_alloy', validRawIds)).toBe('gtceu:red_alloy');
  });

  it('accepts @ machine blacklist entries when enabled for the shared blacklist input', () => {
    expect(
      resolveExplicitListEntryValue('', '@Assembler', validRawIds, {
        allowMachineEntries: true,
      }),
    ).toBe('@assembler');
  });

  it('still rejects @ machine blacklist entries in sections that only allow materials', () => {
    expect(resolveExplicitListEntryValue('', '@assembler', validRawIds)).toBeNull();
  });
});
