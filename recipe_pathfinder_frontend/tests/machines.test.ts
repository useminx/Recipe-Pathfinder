import { describe, expect, it } from 'vitest';
import { buildMachineSuggestions, getMachineDisplayName } from '../src/machines';

describe('getMachineDisplayName', () => {
  it('uses tier-prefixed localization keys for tiered GTCEu singleblock machines', () => {
    expect(
      getMachineDisplayName(
        'gtceu:electrolyzer/salt_water_electrolysis',
        'GTRecipe',
        {
          'gtceu:lv_electrolyzer': 'basic electrolyzer',
        },
        'LV',
      ),
    ).toBe('basic electrolyzer');
  });

  it('falls back from ULV recipes to LV GTCEu machine keys when no ULV block name exists', () => {
    expect(
      getMachineDisplayName(
        'gtceu:assembler/basic_bow',
        'GTRecipe',
        {
          'gtceu:lv_assembler': 'basic assembler',
        },
        'ULV',
      ),
    ).toBe('basic assembler');
  });

  it('translates GTCEu machines from the merged localization map', () => {
    expect(
      getMachineDisplayName('gtceu:large_chemical_reactor/dimethylhydrazine_from_dimethylamine', 'GTRecipe', {
        'gtceu:large_chemical_reactor': 'large chemical reactor',
      }),
    ).toBe('large chemical reactor');
  });

  it('uses uploaded-pack mappings for non-GTCEu machines when available', () => {
    expect(
      getMachineDisplayName('modpack:distillery/example', 'custom_machine', {
        'modpack:distillery': 'distillery',
      }),
    ).toBe('distillery');
  });

  it('falls back to GTOCore controller keys for GTCEu recipe namespaces when available', () => {
    expect(
      getMachineDisplayName(
        'gtceu:laser_welder/mox_fuel_rod',
        'GTRecipe',
        {
          'gtocore:iv_laser_welder': 'elite laser welder',
        },
        'IV',
      ),
    ).toBe('elite laser welder');
  });

  it('uses generic machine lang aliases normalized from uploaded packs', () => {
    expect(
      getMachineDisplayName('gtceu:fission_reactor/test', 'GTRecipe', {
        'gtceu:fission_reactor': 'fission reactor',
      }),
    ).toBe('fission reactor');
  });

  it('falls back to the machine key when no localization exists', () => {
    expect(getMachineDisplayName('modpack:custom_machine/test', 'custom_machine', {})).toBe('custom_machine');
  });
});

describe('buildMachineSuggestions', () => {
  it('builds @-prefixed blacklist suggestions for machine types', () => {
    expect(
      buildMachineSuggestions(
        [
          {
            machine_type: 'nanites_integrated_processing_center',
            recipe_id: 'gtceu:nanites_integrated_processing_center/example',
            eut: 524288,
          },
        ],
        {
          'gtocore:uv_nanites_integrated_processing_center': '纳米集成加工中心',
        },
      ),
    ).toEqual([
      {
        rawId: '@nanites_integrated_processing_center',
        namespace: 'machine',
        primaryLabel: '纳米集成加工中心',
        secondaryLabel: '@nanites_integrated_processing_center',
        hasBuiltInChinese: true,
        kind: 'machine',
      },
    ]);
  });
});
