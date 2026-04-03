import { describe, expect, it } from 'vitest';
import {
  buildMergedLocalizationMap,
  createLocalizationPack,
  loadLocalizationPacks,
  parseLanguagePackText,
  saveLocalizationPacks,
  sanitizeLanguagePackEntries,
} from '../src/localizationPacks';

describe('sanitizeLanguagePackEntries', () => {
  it('keeps only string values', () => {
    expect(
      sanitizeLanguagePackEntries({
        'item.gtceu.test': 'test value',
        ignored: 123,
        nested: { nope: true },
      }),
    ).toEqual({
      'item.gtceu.test': 'test value',
    });
  });
});

describe('parseLanguagePackText', () => {
  it('rejects non-object JSON roots', () => {
    expect(() => parseLanguagePackText('[]', 'bad.json')).toThrow('bad.json');
  });

  it('rejects zero-usable-entry packs', () => {
    expect(() => parseLanguagePackText('{"a":1}', 'empty.json')).toThrow('empty.json');
  });

  it('normalizes standard minecraft lang keys into raw material ids', () => {
    const parsed = parseLanguagePackText(
      JSON.stringify({
        'material.gtocore.rocket_fuel_h8n4c2o4': 'rocket fuel',
        'block.gtocore.component_assembler': 'component assembler',
        'item.minecraft.bow': 'bow',
      }),
      'zh_cn.json',
    );

    expect(parsed['gtocore:rocket_fuel_h8n4c2o4']).toBe('rocket fuel');
    expect(parsed['gtocore:component_assembler']).toBe('component assembler');
    expect(parsed['minecraft:bow']).toBe('bow');
  });

  it('does not turn tooltip-style lang keys into fake raw ids', () => {
    const parsed = parseLanguagePackText(
      JSON.stringify({
        'item.gtceu.programmed_circuit.tooltip.0': 'right click to configure',
      }),
      'zh_cn.json',
    );

    expect(parsed['gtceu:programmed_circuit.tooltip.0']).toBeUndefined();
    expect(parsed['item.gtceu.programmed_circuit.tooltip.0']).toBe('right click to configure');
  });

  it('normalizes two-part machine lang keys and strips formatting codes', () => {
    const parsed = parseLanguagePackText(
      JSON.stringify({
        'gtceu.fission_reactor': 'fission reactor',
        'block.gtocore.iv_laser_welder': '§9elite laser welder §r',
      }),
      'zh_cn.json',
    );

    expect(parsed['gtceu:fission_reactor']).toBe('fission reactor');
    expect(parsed['gtocore:iv_laser_welder']).toBe('elite laser welder');
  });
});

describe('buildMergedLocalizationMap', () => {
  it('lets built-in entries beat user packs', () => {
    const merged = buildMergedLocalizationMap(
      { 'gtceu:steel_dust': 'steel dust' },
      [
        {
          id: 'user-1',
          name: 'Pack A',
          fileName: 'a.json',
          uploadOrder: 1,
          entryCount: 1,
          translations: { 'gtceu:steel_dust': 'override failed' },
        },
      ],
    );

    expect(merged['gtceu:steel_dust']).toBe('steel dust');
  });

  it('keeps earlier user uploads ahead of later ones', () => {
    const merged = buildMergedLocalizationMap(
      {},
      [
        {
          id: 'user-1',
          name: 'Pack A',
          fileName: 'a.json',
          uploadOrder: 1,
          entryCount: 1,
          translations: { 'mod:item': 'first upload' },
        },
        {
          id: 'user-2',
          name: 'Pack B',
          fileName: 'b.json',
          uploadOrder: 2,
          entryCount: 1,
          translations: { 'mod:item': 'second upload' },
        },
      ],
    );

    expect(merged['mod:item']).toBe('first upload');
  });

  it('fills missing keys from later packs', () => {
    const merged = buildMergedLocalizationMap(
      {},
      [
        {
          id: 'user-1',
          name: 'Pack A',
          fileName: 'a.json',
          uploadOrder: 1,
          entryCount: 1,
          translations: { 'mod:first': 'first' },
        },
        {
          id: 'user-2',
          name: 'Pack B',
          fileName: 'b.json',
          uploadOrder: 2,
          entryCount: 1,
          translations: { 'mod:second': 'second' },
        },
      ],
    );

    expect(merged).toEqual({
      'mod:first': 'first',
      'mod:second': 'second',
    });
  });
});

describe('createLocalizationPack', () => {
  it('derives stable pack metadata from uploaded translations', () => {
    expect(
      createLocalizationPack('kubejs-zh_cn.json', { 'mod:item': 'name' }, 3),
    ).toEqual({
      id: 'pack-3-kubejs-zh_cn.json',
      name: 'kubejs-zh_cn',
      fileName: 'kubejs-zh_cn.json',
      uploadOrder: 3,
      entryCount: 1,
      translations: { 'mod:item': 'name' },
    });
  });

  it('clones translations defensively', () => {
    const source = { 'mod:item': 'original' };
    const pack = createLocalizationPack('kubejs-zh_cn.json', source, 4);

    source['mod:item'] = 'mutated';

    expect(pack.translations['mod:item']).toBe('original');
  });
});

describe('loadLocalizationPacks', () => {
  it('sanitizes persisted translations and recomputes entry counts', () => {
    const storage: Record<string, string> = {};
    (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = {
      getItem: (key: string) => (key in storage ? storage[key] : null),
      setItem: (key: string, value: string) => {
        storage[key] = value;
      },
      removeItem: (key: string) => {
        delete storage[key];
      },
      clear: () => {
        for (const key of Object.keys(storage)) {
          delete storage[key];
        }
      },
      key: (index: number) => Object.keys(storage)[index] ?? null,
      get length() {
        return Object.keys(storage).length;
      },
    } as Storage;

    saveLocalizationPacks([
      {
        id: 'pack-1-kubejs-zh_cn.json',
        name: 'kubejs-zh_cn',
        fileName: 'kubejs-zh_cn.json',
        uploadOrder: 1,
        entryCount: 99,
        translations: {
          'mod:item': 'name',
          'gtceu.fission_reactor': 'fission reactor',
          'block.gtocore.iv_laser_welder': '§9elite laser welder §r',
          ignored: 123 as unknown as string,
        },
      },
    ]);

    expect(loadLocalizationPacks()).toEqual([
      {
        id: 'pack-1-kubejs-zh_cn.json',
        name: 'kubejs-zh_cn',
        fileName: 'kubejs-zh_cn.json',
        uploadOrder: 1,
        entryCount: 5,
        translations: {
          'mod:item': 'name',
          'gtceu.fission_reactor': 'fission reactor',
          'gtceu:fission_reactor': 'fission reactor',
          'block.gtocore.iv_laser_welder': 'elite laser welder',
          'gtocore:iv_laser_welder': 'elite laser welder',
        },
      },
    ]);
  });
});
