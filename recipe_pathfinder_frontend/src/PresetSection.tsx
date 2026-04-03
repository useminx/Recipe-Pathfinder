import { useEffect, useState } from 'react';
import { ChevronDown, Copy, FolderClosed, Import, Pencil, Plus, Save, Settings, Trash2, X } from 'lucide-react';
import MaterialSearchInput from './MaterialSearchInput';
import { resolveExplicitListEntryValue } from './materialInputValue';
import { formatMaterialDisplay, type LocalizationMap } from './materialLocalization';
import { formatMachineBlacklistDisplay } from './machines';
import { appendEntries } from './presetGroups';
import { useTranslation } from './i18n';
import type { MaterialSuggestion, PresetGroup } from './types';

type ApplyMode = 'replace' | 'append';

interface PresetSectionProps {
  title: string;
  helperText: string;
  entries: string[];
  addPlaceholder: string;
  allowMachineEntries?: boolean;
  testId?: string;
  storageKey: string;
  localizationMap: LocalizationMap;
  materialSuggestions: MaterialSuggestion[];
  presets: PresetGroup[];
  onChangeEntries: (entries: string[]) => void;
  onSaveCurrentAsPreset: (name: string) => string | null;
  onImportPreset: (name: string, text: string) => string | null;
  onApplyPreset: (presetId: string, mode: ApplyMode) => void;
  onCopyPreset: (presetId: string) => Promise<string | null> | string | null;
  onRenamePreset: (presetId: string, name: string) => string | null;
  onDeletePreset: (presetId: string) => void;
}

const PresetSection = ({
  title,
  helperText,
  entries,
  addPlaceholder,
  allowMachineEntries = false,
  testId,
  storageKey,
  localizationMap,
  materialSuggestions,
  presets,
  onChangeEntries,
  onSaveCurrentAsPreset,
  onImportPreset,
  onApplyPreset,
  onCopyPreset,
  onRenamePreset,
  onDeletePreset,
}: PresetSectionProps) => {
  const { lang } = useTranslation();
  const [selectedEntry, setSelectedEntry] = useState('');
  const [selectedEntryDraft, setSelectedEntryDraft] = useState('');
  const [, setIsSelectedEntryCommitted] = useState(false);
  const [showImportForm, setShowImportForm] = useState(false);
  const [importName, setImportName] = useState('');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? saved === 'true' : false;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, String(isExpanded));
  }, [isExpanded, storageKey]);

  const emptyEntriesText = lang === 'en' ? 'Current list is empty' : '当前列表为空';
  const saveCurrentLabel = lang === 'en' ? 'Save current as group' : '保存当前为组';
  const importTextLabel = lang === 'en' ? 'Import text' : '导入文本';
  const presetNamePlaceholder = lang === 'en' ? 'Preset group name' : '配置组名称';
  const importBodyPlaceholder = lang === 'en' ? 'One item or fluid ID per line' : '每行一个物品或流体 ID';
  const importAsNewLabel = lang === 'en' ? 'Import as new group' : '导入为新组';
  const cancelLabel = lang === 'en' ? 'Cancel' : '取消';
  const emptyPresetsText = lang === 'en' ? 'No saved preset groups yet' : '还没有保存的配置组';
  const replaceCurrentLabel = lang === 'en' ? 'Replace current' : '替换当前';
  const appendCurrentLabel = lang === 'en' ? 'Append current' : '追加当前';
  const copyLabel = lang === 'en' ? 'Copy' : '复制';
  const renameLabel = lang === 'en' ? 'Rename' : '重命名';
  const deleteLabel = lang === 'en' ? 'Delete' : '删除';
  const itemCountSuffix = lang === 'en' ? 'items' : '条';

  const addEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const value = resolveExplicitListEntryValue(
      selectedEntry,
      selectedEntryDraft,
      materialSuggestions.map((suggestion) => suggestion.rawId),
      { allowMachineEntries },
    );

    if (!value) {
      return;
    }

    onChangeEntries(appendEntries(entries, [value]));
    setSelectedEntry('');
    setSelectedEntryDraft('');
    setIsSelectedEntryCommitted(false);
  };

  const removeEntry = (value: string) => {
    onChangeEntries(entries.filter((entry) => entry !== value));
  };

  const handleSavePreset = () => {
    const promptTitle = lang === 'en' ? `Save ${title} preset group` : `保存 ${title} 配置组`;
    const name = window.prompt(promptTitle, '');
    if (!name) {
      return;
    }

    const error = onSaveCurrentAsPreset(name);
    setMessage(error ?? (lang === 'en' ? `Saved ${name.trim()}` : `已保存 ${name.trim()}`));
  };

  const handleImportPreset = () => {
    const error = onImportPreset(importName, importText);
    if (error) {
      setMessage(error);
      return;
    }

    setMessage(lang === 'en' ? `Imported ${importName.trim()}` : `已导入 ${importName.trim()}`);
    setShowImportForm(false);
    setImportName('');
    setImportText('');
  };

  const handleCopyPreset = async (presetId: string) => {
    const error = await onCopyPreset(presetId);
    setMessage(error ?? (lang === 'en' ? 'Copied as plain text' : '已复制为纯文本'));
  };

  const handleRenamePreset = (presetId: string, currentName: string) => {
    const promptTitle = lang === 'en' ? `Rename ${title} preset group` : `重命名 ${title} 配置组`;
    const name = window.prompt(promptTitle, currentName);
    if (!name) {
      return;
    }

    const error = onRenamePreset(presetId, name);
    setMessage(error ?? (lang === 'en' ? `Renamed to ${name.trim()}` : `已重命名为 ${name.trim()}`));
  };

  return (
    <section className="sidebar-card" data-testid={testId}>
      <div className="sidebar-collapsible-header" onClick={() => setIsExpanded((current) => !current)}>
        <div className="sidebar-card-header" style={{ marginBottom: 0, flex: 1 }}>
          <div>
            <h3>{title}</h3>
            {isExpanded && <p>{helperText}</p>}
          </div>
          <span className="sidebar-card-count">{entries.length}</span>
        </div>
        <ChevronDown
          size={14}
          style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
        />
      </div>

      {isExpanded && (
        <div className="sidebar-collapsible-body">
          <form className="tag-input-container" onSubmit={addEntry}>
            <MaterialSearchInput
              value={selectedEntry}
              onChange={(value) => {
                setSelectedEntry(value);
                setSelectedEntryDraft(value);
                setIsSelectedEntryCommitted(Boolean(value));
              }}
              onDraftChange={setSelectedEntryDraft}
              onDraftMatchChange={setIsSelectedEntryCommitted}
              suggestions={materialSuggestions}
              placeholder={addPlaceholder}
            />
            <button type="submit" className="btn-icon" title={lang === 'en' ? `Add to ${title}` : `添加到 ${title}`}>
              <Plus size={16} />
            </button>
          </form>

          <div className="tag-list sidebar-tag-list">
            {entries.length === 0 ? (
              <div className="sidebar-empty-state">{emptyEntriesText}</div>
            ) : (
              entries.map((entry) => {
                const isMachineEntry = allowMachineEntries && entry.trim().startsWith('@');
                const display = isMachineEntry
                  ? formatMachineBlacklistDisplay(entry, materialSuggestions, localizationMap)
                  : formatMaterialDisplay(entry, localizationMap);

                return (
                  <span key={entry} className={`tag tag-localized ${isMachineEntry ? 'tag-machine' : ''}`}>
                    {isMachineEntry && <Settings size={12} className="tag-machine-icon" />}
                    <span className="tag-labels">
                      <span className="tag-primary">{display.primaryLabel}</span>
                      {display.secondaryLabel && <span className="tag-secondary">{display.secondaryLabel}</span>}
                    </span>
                    <X size={12} className="remove" onClick={() => removeEntry(entry)} />
                  </span>
                );
              })
            )}
          </div>

          <div className="sidebar-card-actions">
            <button type="button" className="btn-secondary sidebar-mini-btn" onClick={handleSavePreset}>
              <Save size={14} />
              {saveCurrentLabel}
            </button>
            <button
              type="button"
              className="btn-secondary sidebar-mini-btn"
              onClick={() => {
                setShowImportForm((current) => !current);
                setMessage(null);
              }}
            >
              <Import size={14} />
              {importTextLabel}
            </button>
          </div>

          {showImportForm && (
            <div className="sidebar-import-panel">
              <input
                type="text"
                className="form-control"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                placeholder={presetNamePlaceholder}
              />
              <textarea
                className="form-control sidebar-import-textarea"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={importBodyPlaceholder}
              />
              <div className="sidebar-card-actions">
                <button type="button" className="btn-primary sidebar-mini-btn" onClick={handleImportPreset}>
                  {importAsNewLabel}
                </button>
                <button
                  type="button"
                  className="btn-secondary sidebar-mini-btn"
                  onClick={() => {
                    setShowImportForm(false);
                    setImportName('');
                    setImportText('');
                  }}
                >
                  {cancelLabel}
                </button>
              </div>
            </div>
          )}

          {message && <div className="sidebar-message">{message}</div>}

          <div className="sidebar-preset-list">
            {presets.length === 0 ? (
              <div className="sidebar-empty-state">{emptyPresetsText}</div>
            ) : (
              presets.map((preset) => {
                const isActive = activePresetId === preset.id;

                return (
                  <div key={preset.id} className={`sidebar-preset ${isActive ? 'active' : ''}`}>
                    <button
                      type="button"
                      className="sidebar-preset-main"
                      onClick={() => setActivePresetId(isActive ? null : preset.id)}
                    >
                      <div className="sidebar-preset-title">
                        <FolderClosed size={15} />
                        <span>{preset.name}</span>
                      </div>
                      <span className="sidebar-preset-meta">{preset.entries.length} {itemCountSuffix}</span>
                    </button>

                    {isActive && (
                      <div className="sidebar-preset-actions">
                        <button
                          type="button"
                          className="btn-primary sidebar-mini-btn"
                          onClick={() => onApplyPreset(preset.id, 'replace')}
                        >
                          {replaceCurrentLabel}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary sidebar-mini-btn"
                          onClick={() => onApplyPreset(preset.id, 'append')}
                        >
                          {appendCurrentLabel}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary sidebar-mini-btn"
                          onClick={() => void handleCopyPreset(preset.id)}
                        >
                          <Copy size={13} />
                          {copyLabel}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary sidebar-mini-btn"
                          onClick={() => handleRenamePreset(preset.id, preset.name)}
                        >
                          <Pencil size={13} />
                          {renameLabel}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary sidebar-mini-btn danger"
                          onClick={() => onDeletePreset(preset.id)}
                        >
                          <Trash2 size={13} />
                          {deleteLabel}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default PresetSection;
