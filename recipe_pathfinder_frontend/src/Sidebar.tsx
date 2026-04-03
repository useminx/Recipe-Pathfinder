import { useState, useEffect, useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { LocalizationPack, PathfinderResponse, PresetGroup, PresetKind } from './types';
import { fetchMachines, fetchMaterials, fetchRecipeFiles, uploadRecipeFiles, deleteRecipeFile } from './api';
import {
  StopCircle,
  Filter,
  ArrowDownWideNarrow,
  ListTree,
  Download,
  Play,
  ChevronDown,
  Database,
  Trash2,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from './i18n';
import MaterialSearchInput from './MaterialSearchInput';
import { BUILT_IN_LOCALIZATION, buildMaterialSuggestions, type LocalizationMap } from './materialLocalization';
import { buildMachineSuggestions } from './machines';
import { resolveExplicitTargetValue } from './materialInputValue';
import { createLocalizationPack, parseLanguagePackText } from './localizationPacks';
import PresetSection from './PresetSection';
import { downloadTreeExport } from './treeExport';
import {
  appendEntries,
  createPresetGroup,
  entriesToPlainText,
  loadPresetGroups,
  normalizeEntries,
  parseEntriesFromPlainText,
  savePresetGroups,
} from './presetGroups';
import type { MachineCatalogEntry, MaterialSuggestion } from './types';

interface SidebarProps {
  data: PathfinderResponse | null;
  localizationMap: LocalizationMap;
  localizationPacks: LocalizationPack[];
  onChangeLocalizationPacks: (packs: LocalizationPack[]) => void;
  onSearch: (params: import('./types').PathfinderRequest) => void;
  onClear: () => void;
}

const Sidebar = ({
  data,
  localizationMap,
  localizationPacks,
  onChangeLocalizationPacks,
  onSearch,
  onClear,
}: SidebarProps) => {
  const [target, setTarget] = useState(() => localStorage.getItem('gtp_target') || 'gtceu:lv_machine_hull');
  const [targetDraft, setTargetDraft] = useState(target);
  const [materials, setMaterials] = useState<string[]>(() => {
    const saved = localStorage.getItem('gtp_materials');
    return saved ? normalizeEntries(JSON.parse(saved)) : ['minecraft:iron_ingot', 'minecraft:redstone'];
  });
  const [whitelist, setWhitelist] = useState<string[]>(() => {
    const saved = localStorage.getItem('gtp_whitelist');
    return saved ? normalizeEntries(JSON.parse(saved)) : [];
  });
  const [blacklist, setBlacklist] = useState<string[]>(() => {
    const saved = localStorage.getItem('gtp_blacklist');
    return saved ? normalizeEntries(JSON.parse(saved)) : ['minecraft:water'];
  });
  const [materialGroups, setMaterialGroups] = useState<PresetGroup[]>(() => loadPresetGroups('materials'));
  const [whitelistGroups, setWhitelistGroups] = useState<PresetGroup[]>(() => loadPresetGroups('whitelist'));
  const [blacklistGroups, setBlacklistGroups] = useState<PresetGroup[]>(() => loadPresetGroups('blacklist'));

  const [materialOptions, setMaterialOptions] = useState<string[]>([]);
  const [machineOptions, setMachineOptions] = useState<MachineCatalogEntry[]>([]);
  const [materialSuggestions, setMaterialSuggestions] = useState<MaterialSuggestion[]>([]);
  const [blacklistSuggestions, setBlacklistSuggestions] = useState<MaterialSuggestion[]>([]);
  const [localizationMessage, setLocalizationMessage] = useState('');
  const [treeExportMessage, setTreeExportMessage] = useState('');
  const [recipeFiles, setRecipeFiles] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const [showLocalizationPanel, setShowLocalizationPanel] = useState(
    () => localStorage.getItem('gtp_show_localization_panel') === 'true',
  );
  const [showDataPanel, setShowDataPanel] = useState(
    () => localStorage.getItem('gtp_show_data_panel') === 'true',
  );
  const [showTreePanel, setShowTreePanel] = useState(
    () => localStorage.getItem('gtp_show_tree_panel') === 'true',
  );
  const localizationInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadButtonRef = useRef<HTMLButtonElement | null>(null);

  const [maxNodes, setMaxNodes] = useState(() => Number(localStorage.getItem('gtp_maxNodes')) || 100);
  const [maxTrees, setMaxTrees] = useState(() => Number(localStorage.getItem('gtp_maxTrees')) || 32);

  useEffect(() => { localStorage.setItem('gtp_target', target); }, [target]);
  useEffect(() => { localStorage.setItem('gtp_materials', JSON.stringify(materials)); }, [materials]);
  useEffect(() => { localStorage.setItem('gtp_whitelist', JSON.stringify(whitelist)); }, [whitelist]);
  useEffect(() => { localStorage.setItem('gtp_blacklist', JSON.stringify(blacklist)); }, [blacklist]);
  useEffect(() => { localStorage.setItem('gtp_maxNodes', maxNodes.toString()); }, [maxNodes]);
  useEffect(() => { localStorage.setItem('gtp_maxTrees', maxTrees.toString()); }, [maxTrees]);
  useEffect(() => { savePresetGroups('materials', materialGroups); }, [materialGroups]);
  useEffect(() => { savePresetGroups('whitelist', whitelistGroups); }, [whitelistGroups]);
  useEffect(() => { savePresetGroups('blacklist', blacklistGroups); }, [blacklistGroups]);
  useEffect(() => { localStorage.setItem('gtp_show_localization_panel', String(showLocalizationPanel)); }, [showLocalizationPanel]);
  useEffect(() => { localStorage.setItem('gtp_show_data_panel', String(showDataPanel)); }, [showDataPanel]);
  useEffect(() => { localStorage.setItem('gtp_show_tree_panel', String(showTreePanel)); }, [showTreePanel]);
  useEffect(() => {
    const nextMaterialSuggestions = buildMaterialSuggestions(materialOptions, localizationMap);
    setMaterialSuggestions(nextMaterialSuggestions);
    setBlacklistSuggestions([
      ...buildMachineSuggestions(machineOptions, localizationMap),
      ...nextMaterialSuggestions,
    ]);
  }, [localizationMap, machineOptions, materialOptions]);

  const refreshRecipeData = useCallback(async () => {
    const [filesResult, materialsResult, machinesResult] = await Promise.allSettled([
      fetchRecipeFiles(),
      fetchMaterials(),
      fetchMachines(),
    ]);

    if (filesResult.status === 'fulfilled') {
      setRecipeFiles(filesResult.value);
    } else {
      console.error('Failed to fetch recipe files', filesResult.reason);
      setRecipeFiles([]);
    }

    if (materialsResult.status === 'fulfilled') {
      setMaterialOptions(materialsResult.value);
    } else {
      throw materialsResult.reason;
    }

    if (machinesResult.status === 'fulfilled') {
      setMachineOptions(machinesResult.value);
    } else {
      console.error('Failed to fetch machines', machinesResult.reason);
      setMachineOptions([]);
    }
  }, []);

  useEffect(() => {
    refreshRecipeData().catch(console.error);
  }, [refreshRecipeData]);

  useEffect(() => {
    if (!showDataPanel) {
      return;
    }

    requestAnimationFrame(() => {
      uploadButtonRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [showDataPanel]);

  const { t, lang } = useTranslation();
  const builtInPackEntryCount = Object.keys(BUILT_IN_LOCALIZATION).length;
  const nodeLimitLabel = lang === 'en' ? 'Node Limit' : '节点数上限';
  const routeLimitLabel = lang === 'en' ? 'Route Budget' : '搜索路线总量';
  const recipeDataTitle = lang === 'en' ? 'Recipe Data' : '配方数据管理';
  const uploadButtonText = isUploading
    ? (lang === 'en' ? 'Rebuilding Index...' : '正在合并索引...')
    : (lang === 'en' ? 'Upload Local JSON' : '上传本地 JSON');
  const uploadHintText = lang === 'en'
    ? 'You can select multiple local recipe files at once.'
    : '支持一次选择多个本地配方文件。';
  const emptyRecipeFilesText = lang === 'en'
    ? 'No JSON recipe files loaded'
    : '未加载任何 JSON 文件';
  const defaultUploadMessage = lang === 'en'
    ? 'You can select multiple .json files at once. Uploaded files will be merged into the search index automatically.'
    : '可一次选择多个 .json 文件，上传后会自动合并进搜索索引。';
  const materialsTitle = lang === 'en' ? 'Materials' : '原材料';
  const materialsHelper = lang === 'en'
    ? 'Treat as available source materials and stop expanding when matched.'
    : '作为现成材料使用，匹配到后会停止向下展开。';
  const whitelistTitle = lang === 'en' ? 'Whitelist' : '白名单';
  const whitelistHelper = lang === 'en'
    ? 'Candidate trees must contain every whitelist ID, or they will be removed.'
    : '候选树必须包含全部白名单 ID，否则该树会被剔除。';
  const blacklistHelper = lang === 'en'
    ? 'Matching blacklist entries will cut that branch. Use @machine_type or @recipe_id for machine filters.'
    : '匹配到黑名单时，该分支会被强制截断。';
  const deleteRecipeFileTitle = lang === 'en' ? 'Remove and reload' : '移除并重载';

  useEffect(() => {
    setUploadMessage(defaultUploadMessage);
  }, [defaultUploadMessage]);

  const getPresetState = (
    kind: PresetKind,
  ): [PresetGroup[], Dispatch<SetStateAction<PresetGroup[]>>, string[], Dispatch<SetStateAction<string[]>>] => {
    switch (kind) {
      case 'materials':
        return [materialGroups, setMaterialGroups, materials, setMaterials];
      case 'whitelist':
        return [whitelistGroups, setWhitelistGroups, whitelist, setWhitelist];
      case 'blacklist':
        return [blacklistGroups, setBlacklistGroups, blacklist, setBlacklist];
      default:
        return [materialGroups, setMaterialGroups, materials, setMaterials];
    }
  };

  const saveCurrentAsPreset = (kind: PresetKind, name: string): string | null => {
    const [groups, setGroups, entries] = getPresetState(kind);
    const trimmedName = name.trim();

    if (!trimmedName) {
      return '配置组名称不能为空。';
    }
    if (entries.length === 0) {
      return '当前列表为空，无法保存为配置组。';
    }
    if (groups.some((group) => group.name === trimmedName)) {
      return '已存在同名配置组，请换一个名称。';
    }

    setGroups((current) => [...current, createPresetGroup(trimmedName, entries)]);
    return null;
  };

  const importPreset = (kind: PresetKind, name: string, text: string): string | null => {
    const [groups, setGroups] = getPresetState(kind);
    const trimmedName = name.trim();
    const entries = parseEntriesFromPlainText(text);

    if (!trimmedName) {
      return '导入时必须填写配置组名称。';
    }
    if (entries.length === 0) {
      return '导入文本为空，请至少提供一行 ID。';
    }
    if (groups.some((group) => group.name === trimmedName)) {
      return '已存在同名配置组，请换一个名称。';
    }

    setGroups((current) => [...current, createPresetGroup(trimmedName, entries)]);
    return null;
  };

  const applyPreset = (kind: PresetKind, presetId: string, mode: 'replace' | 'append') => {
    const [groups, , , setEntries] = getPresetState(kind);
    const preset = groups.find((group) => group.id === presetId);
    if (!preset) {
      return;
    }

    setEntries((current) => (mode === 'replace' ? preset.entries : appendEntries(current, preset.entries)));
  };

  const copyPreset = async (kind: PresetKind, presetId: string): Promise<string | null> => {
    const [groups] = getPresetState(kind);
    const preset = groups.find((group) => group.id === presetId);
    if (!preset) {
      return '找不到要复制的配置组。';
    }

    const text = entriesToPlainText(preset.entries);
    try {
      await navigator.clipboard.writeText(text);
      return null;
    } catch {
      window.prompt('复制以下纯文本内容', text);
      return null;
    }
  };

  const renamePreset = (kind: PresetKind, presetId: string, name: string): string | null => {
    const [groups, setGroups] = getPresetState(kind);
    const trimmedName = name.trim();

    if (!trimmedName) {
      return '配置组名称不能为空。';
    }
    if (groups.some((group) => group.id !== presetId && group.name === trimmedName)) {
      return '已存在同名配置组，请换一个名称。';
    }

    setGroups((current) =>
      current.map((group) => (group.id === presetId ? { ...group, name: trimmedName } : group)),
    );
    return null;
  };

  const deletePreset = (kind: PresetKind, presetId: string) => {
    const [groups, setGroups] = getPresetState(kind);
    const preset = groups.find((group) => group.id === presetId);
    if (!preset) {
      return;
    }
    if (!window.confirm(`确定要删除配置组 ${preset.name} 吗？`)) {
      return;
    }

    setGroups((current) => current.filter((group) => group.id !== presetId));
  };

  const openFilePicker = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  const openLocalizationPicker = () => {
    localizationInputRef.current?.click();
  };

  const handleLocalizationUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) {
      return;
    }

    const nextPacks = [...localizationPacks];
    let nextOrder = nextPacks.reduce((max, pack) => Math.max(max, pack.uploadOrder), 0) + 1;

    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        const translations = parseLanguagePackText(text, file.name);
        nextPacks.push(createLocalizationPack(file.name, translations, nextOrder));
        nextOrder += 1;
      }

      onChangeLocalizationPacks(nextPacks);
      setLocalizationMessage(t.localizationPackImported(files.length));
    } catch (error) {
      setLocalizationMessage(error instanceof Error ? error.message : t.localizationPackImportFailed);
    } finally {
      event.target.value = '';
    }
  };

  const handleDeleteLocalizationPack = (packId: string) => {
    onChangeLocalizationPacks(localizationPacks.filter((pack) => pack.id !== packId));
    setLocalizationMessage('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles?.length) return;
    setIsUploading(true);
    setUploadMessage(`正在导入 ${selectedFiles.length} 个 JSON 文件并重建索引...`);
    try {
      const result = await uploadRecipeFiles(selectedFiles);
      await refreshRecipeData();
      setUploadMessage(`已导入 ${result.files.length} 个文件，新的配方已参与搜索。`);
    } catch (err) {
      console.error('Upload failed', err);
      setUploadMessage(err instanceof Error ? err.message : '上传失败，详见控制台。');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleDeleteFile = async (name: string) => {
    if (!window.confirm(`确定要移除 ${name} 吗？`)) return;
    try {
      await deleteRecipeFile(name);
      await refreshRecipeData();
      setUploadMessage(`已移除 ${name}，索引已刷新。`);
    } catch (err) {
      console.error('Delete failed', err);
      setUploadMessage(err instanceof Error ? err.message : '删除失败，详见控制台。');
    }
  };

  const scrollToTree = (index: number) => {
    const el = document.getElementById(`recipe-tree-${index}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleTreeDownload = (treeIndex: number) => {
    if (!data) {
      return;
    }

    try {
      downloadTreeExport(data, treeIndex);
      setTreeExportMessage('');
    } catch (error) {
      setTreeExportMessage(error instanceof Error ? error.message : t.treeExportFailed);
    }
  };

  return (
    <>
      <div className="sidebar-header">
        <Filter size={20} /> {t.configuration}
      </div>
      <div className="sidebar-content">
        <div className="sidebar-scroll-body">
          <div className="sidebar-card" data-testid="localization-pack-panel">
            <div
              className="sidebar-collapsible-header"
              onClick={() => setShowLocalizationPanel((current) => !current)}
            >
              <div className="sidebar-card-header" style={{ marginBottom: 0, flex: 1 }}>
                <div>
                  <h3 data-testid="localization-pack-heading">{t.localizationPacks}</h3>
                  {showLocalizationPanel && <p>{t.localizationPackHint}</p>}
                </div>
                <span className="sidebar-card-count">{localizationPacks.length + 1}</span>
              </div>
              <ChevronDown
                size={14}
                style={{ transform: showLocalizationPanel ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
              />
            </div>

            {showLocalizationPanel && (
              <div className="sidebar-collapsible-body">
                <input
                  ref={localizationInputRef}
                  type="file"
                  multiple
                  accept=".json,application/json"
                  onChange={handleLocalizationUpload}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={openLocalizationPicker}
                  className="sidebar-upload-btn"
                  data-testid="localization-pack-upload-button"
                >
                  <Upload size={14} />
                  {t.uploadLocalizationPack}
                </button>

                {localizationMessage ? <div className="sidebar-message">{localizationMessage}</div> : null}

                <div className="sidebar-file-list">
                  <div className="sidebar-file-item sidebar-file-item-fixed" data-testid="localization-pack-built-in-row">
                    <span
                      className="sidebar-file-name"
                      title={t.builtInLocalizationPack}
                      data-testid="localization-pack-built-in-name"
                    >
                      {t.builtInLocalizationPack}
                    </span>
                    <span className="sidebar-pack-meta">{builtInPackEntryCount}</span>
                  </div>

                  {localizationPacks.length === 0 ? (
                    <div className="sidebar-empty-state">{t.localizationPackEmpty}</div>
                  ) : (
                    localizationPacks.map((pack) => (
                      <div key={pack.id} className="sidebar-file-item" data-testid={`localization-pack-row-${pack.id}`}>
                        <span className="sidebar-file-name" title={pack.fileName}>
                          {pack.fileName}
                        </span>
                        <div className="sidebar-file-actions">
                          <span className="sidebar-pack-meta">{pack.entryCount}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteLocalizationPack(pack.id)}
                            className="sidebar-file-delete"
                            title={t.deleteLocalizationPack}
                            data-testid={`localization-pack-delete-${pack.id}`}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>{t.targetProduct}</label>
            <MaterialSearchInput
              value={target}
              onChange={(value) => {
                setTarget(value);
                setTargetDraft(value);
              }}
              onDraftChange={setTargetDraft}
              suggestions={materialSuggestions}
              placeholder={t.targetPlaceholder}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem' }}>{nodeLimitLabel}</label>
              <input
                type="number"
                className="form-control"
                value={maxNodes}
                onChange={(e) => setMaxNodes(Math.max(1, parseInt(e.target.value, 10) || 100))}
                min={1}
                max={200}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label style={{ fontSize: '0.8rem' }}>{routeLimitLabel}</label>
              <input
                type="number"
                className="form-control"
                value={maxTrees}
                onChange={(e) => setMaxTrees(Math.min(64, Math.max(1, parseInt(e.target.value, 10) || 32)))}
                min={1}
                max={64}
              />
            </div>
          </div>

          <div className="sidebar-card">
            <div
              className="sidebar-collapsible-header"
              onClick={() => setShowDataPanel(!showDataPanel)}
            >
              <div className="sidebar-card-title">
                <Database size={14} /> {recipeDataTitle} ({recipeFiles.length})
              </div>
              <ChevronDown
                size={14}
                style={{ transform: showDataPanel ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
              />
            </div>

            {showDataPanel && (
              <div className="sidebar-collapsible-body">
                <div className="sidebar-card-helper">{uploadMessage}</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".json"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  disabled={isUploading}
                />
                <button
                  ref={uploadButtonRef}
                  type="button"
                  onClick={openFilePicker}
                  disabled={isUploading}
                  className="sidebar-upload-btn"
                >
                  {isUploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
                  {uploadButtonText}
                </button>
                <div className="sidebar-inline-hint">{uploadHintText}</div>
                <div className="sidebar-file-list">
                  {recipeFiles.length === 0 ? (
                    <div className="sidebar-empty-state">{emptyRecipeFilesText}</div>
                  ) : (
                    recipeFiles.map((file) => (
                      <div key={file} className="sidebar-file-item">
                        <span className="sidebar-file-name" title={file}>{file}</span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteFile(file)}
                          className="sidebar-file-delete"
                          title={deleteRecipeFileTitle}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <PresetSection
            title={materialsTitle}
            helperText={materialsHelper}
            entries={materials}
            addPlaceholder=""
            storageKey="gtp_show_materials_panel"
            testId="materials-preset-section"
            localizationMap={localizationMap}
            materialSuggestions={materialSuggestions}
            presets={materialGroups}
            onChangeEntries={setMaterials}
            onSaveCurrentAsPreset={(name) => saveCurrentAsPreset('materials', name)}
            onImportPreset={(name, text) => importPreset('materials', name, text)}
            onApplyPreset={(presetId, mode) => applyPreset('materials', presetId, mode)}
            onCopyPreset={(presetId) => copyPreset('materials', presetId)}
            onRenamePreset={(presetId, name) => renamePreset('materials', presetId, name)}
            onDeletePreset={(presetId) => deletePreset('materials', presetId)}
          />

          <PresetSection
            title={whitelistTitle}
            helperText={whitelistHelper}
            entries={whitelist}
            addPlaceholder=""
            localizationMap={localizationMap}
            materialSuggestions={materialSuggestions}
            presets={whitelistGroups}
            testId="whitelist-preset-section"
            storageKey="gtp_show_whitelist_panel"
            onChangeEntries={setWhitelist}
            onSaveCurrentAsPreset={(name) => saveCurrentAsPreset('whitelist', name)}
            onImportPreset={(name, text) => importPreset('whitelist', name, text)}
            onApplyPreset={(presetId, mode) => applyPreset('whitelist', presetId, mode)}
            onCopyPreset={(presetId) => copyPreset('whitelist', presetId)}
            onRenamePreset={(presetId, name) => renamePreset('whitelist', presetId, name)}
            onDeletePreset={(presetId) => deletePreset('whitelist', presetId)}
          />

          <PresetSection
            title={t.blacklist}
            helperText={blacklistHelper}
            entries={blacklist}
            addPlaceholder=""
            allowMachineEntries
            storageKey="gtp_show_blacklist_panel"
            localizationMap={localizationMap}
            materialSuggestions={blacklistSuggestions}
            presets={blacklistGroups}
            onChangeEntries={setBlacklist}
            onSaveCurrentAsPreset={(name) => saveCurrentAsPreset('blacklist', name)}
            onImportPreset={(name, text) => importPreset('blacklist', name, text)}
            onApplyPreset={(presetId, mode) => applyPreset('blacklist', presetId, mode)}
            onCopyPreset={(presetId) => copyPreset('blacklist', presetId)}
            onRenamePreset={(presetId, name) => renamePreset('blacklist', presetId, name)}
            onDeletePreset={(presetId) => deletePreset('blacklist', presetId)}
          />

          {data && data.trees.length > 0 && (
            <div className="form-group sidebar-card" data-testid="tree-export-panel">
              <div
                className="sidebar-collapsible-header"
                onClick={() => setShowTreePanel((current) => !current)}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: 0, flex: 1 }}>
                  <ListTree size={16} /> {t.foundTrees} ({data.trees.length})
                </label>
                <ChevronDown
                  size={14}
                  style={{ transform: showTreePanel ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
                />
              </div>
              {showTreePanel && (
                <div className="sidebar-collapsible-body">
                  <div className="anchor-list">
                    {data.trees.map((_, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="anchor-item"
                          onClick={() => scrollToTree(idx)}
                          style={{ flex: 1 }}
                        >
                          <ArrowDownWideNarrow size={14} style={{ color: 'var(--primary-color)' }} />
                          {t.recipeTree} #{idx + 1}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          title={t.downloadTreeJson}
                          aria-label={t.downloadTreeJson}
                          data-testid={`tree-download-${idx}`}
                          onClick={() => handleTreeDownload(idx)}
                          style={{ padding: '0.45rem 0.55rem', flexShrink: 0 }}
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {treeExportMessage ? <div className="sidebar-message">{treeExportMessage}</div> : null}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sidebar-footer-actions">
          <button
            className="btn-primary"
            onClick={() => {
              const resolvedTarget = resolveExplicitTargetValue(target, targetDraft, materialOptions);
              setTarget(resolvedTarget);
              setTargetDraft(resolvedTarget);

              onSearch({
              target: resolvedTarget,
              target_kind: resolvedTarget.startsWith('fluid:') ? 'fluid' : 'item',
              target_amount: 1,
              available_materials: materials,
              whitelist,
              blacklist,
              max_depth: 64,
              max_trees: maxTrees,
              max_branching_per_material: 20,
              max_nodes_per_tree: maxNodes,
              enable_surplus_reuse: false,
            });
            }}
          >
            <Play size={18} fill="white" /> {t.startSearch}
          </button>
          {data && (
            <button className="btn-secondary" onClick={onClear} style={{ color: 'var(--danger-color)' }}>
              <StopCircle size={18} /> {t.clearResults}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
