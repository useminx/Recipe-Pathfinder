import { describe, expect, it } from 'vitest';
import {
  buildMaterialSuggestions,
  formatInlineMaterialDisplay,
  formatMaterialDisplay,
  searchMaterialSuggestions,
} from '../src/materialLocalization';

describe('formatMaterialDisplay', () => {
  it('uses merged localized labels when available', () => {
    const display = formatMaterialDisplay('modpack:raw_gear', {
      'modpack:raw_gear': 'raw gear',
    });

    expect(display.primaryLabel).toBe('raw gear');
    expect(display.secondaryLabel).toBe('modpack:raw_gear');
  });

  it('falls back to raw ids when no translation exists', () => {
    const display = formatMaterialDisplay('modpack:raw_gear', {});

    expect(display.primaryLabel).toBe('modpack:raw_gear');
    expect(display.secondaryLabel).toBeUndefined();
  });

  it('derives GTCEu material forms from the base material translation when exact ids are missing', () => {
    const display = formatMaterialDisplay('gtceu:polycaprolactam_ingot', {
      'gtceu:polycaprolactam': 'polycaprolactam',
    });

    expect(display.primaryLabel).toBe('polycaprolactam锭');
    expect(display.secondaryLabel).toBe('gtceu:polycaprolactam_ingot');
  });

  it('derives screw forms from the base material translation when exact ids are missing', () => {
    const display = formatMaterialDisplay('gtceu:steel_screw', {
      'gtceu:steel': 'steel',
    });

    expect(display.primaryLabel).toBe('steel螺丝');
    expect(display.secondaryLabel).toBe('gtceu:steel_screw');
  });

  it('derives nugget and frame forms from the base material translation when exact ids are missing', () => {
    const nuggetDisplay = formatMaterialDisplay('gtceu:magnetic_steel_nugget', {
      'gtceu:magnetic_steel': 'magnetic steel',
    });
    const frameDisplay = formatMaterialDisplay('gtceu:steel_frame', {
      'gtceu:steel': 'steel',
    });

    expect(nuggetDisplay.primaryLabel).toBe('magnetic steel粒');
    expect(frameDisplay.primaryLabel).toBe('steel框架');
  });

  it('derives small prefixed dust and spring forms from the base material translation', () => {
    const smallDustDisplay = formatMaterialDisplay('gtceu:small_steel_dust', {
      'gtceu:steel': 'steel',
    });
    const smallMagneticDustDisplay = formatMaterialDisplay('gtceu:small_magnetic_steel_dust', {
      'gtceu:magnetic_steel': 'magnetic steel',
    });
    const smallSpringDisplay = formatMaterialDisplay('gtceu:small_steel_spring', {
      'gtceu:steel': 'steel',
    });

    expect(smallDustDisplay.primaryLabel).toBe('小堆steel粉');
    expect(smallMagneticDustDisplay.primaryLabel).toBe('小堆magnetic steel粉');
    expect(smallSpringDisplay.primaryLabel).toBe('小steel弹簧');
  });

  it('derives GTCEu quality-prefixed gem names from the base material translation', () => {
    const display = formatMaterialDisplay('gtceu:flawless_coal_gem', {
      'gtceu:coal': 'coal',
    });

    expect(display.primaryLabel).toBe('无瑕的coal宝石');
    expect(display.secondaryLabel).toBe('gtceu:flawless_coal_gem');
  });
});

describe('searchMaterialSuggestions', () => {
  const suggestions = buildMaterialSuggestions(
    ['modpack:raw_gear', 'gtceu:steel_dust', 'modpack:untranslated'],
    {
      'modpack:raw_gear': 'raw gear',
      'gtceu:steel_dust': 'steel dust',
    },
  );

  it('returns only translated entries for empty query in default localized mode', () => {
    const result = searchMaterialSuggestions(suggestions, '');

    expect(result.map((entry) => entry.rawId)).toEqual(['gtceu:steel_dust', 'modpack:raw_gear']);
  });

  it('finds uploaded-pack entries in default localized mode', () => {
    const result = searchMaterialSuggestions(suggestions, 'raw gear');

    expect(result.map((entry) => entry.rawId)).toEqual(['modpack:raw_gear']);
  });

  it('keeps untranslated ids hidden in default localized mode', () => {
    const result = searchMaterialSuggestions(suggestions, 'untranslated');

    expect(result.map((entry) => entry.rawId)).toEqual([]);
  });

  it('keeps # mode English-only', () => {
    const result = searchMaterialSuggestions(suggestions, '#steel');

    expect(result.map((entry) => entry.rawId)).toEqual(['gtceu:steel_dust']);
  });
});

describe('formatInlineMaterialDisplay', () => {
  it('returns same-line primary and raw id for localized byproducts', () => {
    const display = formatInlineMaterialDisplay('gtceu:diluted_hydrochloric_acid', {
      'gtceu:diluted_hydrochloric_acid': 'diluted hydrochloric acid',
    });

    expect(display.primaryLabel).toBe('diluted hydrochloric acid');
    expect(display.secondaryLabel).toBe('gtceu:diluted_hydrochloric_acid');
  });

  it('falls back to raw id only for untranslated byproducts', () => {
    const display = formatInlineMaterialDisplay('modpack:custom_slurry', {});

    expect(display.primaryLabel).toBe('modpack:custom_slurry');
    expect(display.secondaryLabel).toBeUndefined();
  });
});
