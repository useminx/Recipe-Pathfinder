import type { NodeProps } from '@xyflow/react';
import { Handle, Position } from '@xyflow/react';
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Package,
  Repeat,
  Settings,
  Zap,
} from 'lucide-react';
import { useTranslation } from './i18n';
import { formatInlineMaterialDisplay, formatMaterialDisplay } from './materialLocalization';
import { getMachineDisplayName, getVoltageTier } from './machines';
import type { MaterialNeedNode, RecipeChoiceNode } from './types';
import './FlowNodes.css';

export const MaterialNodeComponent = ({ data, id }: NodeProps) => {
  const node = data.node as MaterialNeedNode;
  const isTarget = data.isTarget;
  const { lang } = useTranslation();
  const onCopySuccess = data.onCopySuccess as (() => void) | undefined;

  let statusClass = 'neutral';
  let StatusIcon = AlertTriangle;
  if (node.status === 'source_matched') {
    statusClass = 'success';
    StatusIcon = CheckCircle;
  } else if (node.status === 'blacklisted') {
    statusClass = 'danger';
    StatusIcon = Ban;
  }

  const hasChildren = node.children && node.children.length > 0;
  const expanded = data.expanded !== false;
  const localizationMap = data.localizationMap as Record<string, string>;
  const materialDisplay = isTarget
    ? { primaryLabel: node.material, secondaryLabel: null }
    : formatMaterialDisplay(node.material, localizationMap);

  const handleCopyMaterial = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard
      .writeText(node.material)
      .then(() => onCopySuccess?.())
      .catch(() => {});
  };

  return (
    <div className={`flow-node flow-material-node ${statusClass} ${isTarget ? 'is-target' : ''}`}>
      {!isTarget && <Handle type="target" position={Position.Top} className="handle-top" />}

      <div
        className="flow-node-header"
        style={{ cursor: 'pointer' }}
        onClick={handleCopyMaterial}
        title={lang === 'zh' ? '点击复制标签' : 'Click to copy label'}
      >
        <div className="flow-icon-wrap">
          <Package size={16} />
        </div>
        <div className="flow-title-stack">
          <strong className="flow-title">{materialDisplay.primaryLabel}</strong>
          {materialDisplay.secondaryLabel && (
            <span className="flow-title-secondary">{materialDisplay.secondaryLabel}</span>
          )}
        </div>
        <span className="flow-amount">x{node.required_amount}</span>

        {hasChildren && (
          <button
            className="flow-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              (data.onToggle as (nodeId: string) => void)(id);
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {(node.status === 'source_matched' || node.status === 'blacklisted') && (
        <div className="flow-status-bar">
          <StatusIcon size={14} />
          {node.status === 'source_matched'
            ? lang === 'zh'
              ? '已满足'
              : 'Matched'
            : lang === 'zh'
              ? '已黑名单过滤'
              : 'Blacklisted'}
        </div>
      )}

      {node.status === 'satisfied_by_surplus' && (
        <div className="flow-status-bar surplus">{lang === 'zh' ? '余量复用' : 'Surplus reused'}</div>
      )}

      {hasChildren && expanded && <Handle type="source" position={Position.Bottom} className="handle-bottom" />}
    </div>
  );
};

export const RecipeNodeComponent = ({ data, id }: NodeProps) => {
  const node = data.node as RecipeChoiceNode;
  const { t, lang } = useTranslation();
  const onCopySuccess = data.onCopySuccess as (() => void) | undefined;

  const hasChildren = node.children && node.children.length > 0;
  const expanded = data.expanded !== false;
  const localizationMap = data.localizationMap as Record<string, string>;

  const tier = getVoltageTier(node.eut);
  const machineName = getMachineDisplayName(node.recipe_id, node.machine_type, localizationMap, tier);
  const byproducts = node.outputs.filter((out) => out.material !== node.primary_output);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard
      .writeText(`[${tier}] ${machineName}`)
      .then(() => onCopySuccess?.())
      .catch(() => {});
  };

  return (
    <div className="flow-node flow-recipe-node">
      <Handle type="target" position={Position.Top} className="handle-top" />

      <div
        className="flow-node-header recipe-header"
        style={{ cursor: 'pointer' }}
        onClick={handleCopy}
        title={lang === 'zh' ? '点击复制机器名称' : 'Click to copy machine name'}
      >
        <div className="flow-icon-wrap">
          <Settings size={16} />
        </div>
        <strong className="flow-title">
          [{tier}] {machineName}
        </strong>

        {hasChildren && (
          <button
            className="flow-toggle-btn"
            onClick={(e) => {
              e.stopPropagation();
              (data.onToggle as (nodeId: string) => void)(id);
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      <div className="flow-metrics">
        <div className="flow-tag flow-tag-primary">
          <Repeat size={12} /> {node.runs} {t.time}
        </div>
        <div className="flow-tag">
          <Zap size={12} /> {node.eut * node.runs} EU/t
        </div>
        <div className="flow-tag flow-tag-time">
          <Clock size={12} /> {node.duration * node.runs} t
        </div>
      </div>

      {byproducts.length > 0 && (
        <div className="flow-byproducts">
          <div className="byproducts-title">{lang === 'zh' ? '产出副产物:' : 'Byproducts:'}</div>
          <ul className="byproducts-list">
            {byproducts.map((bp, i) => (
              <li key={i}>
                {(() => {
                  const display = formatInlineMaterialDisplay(bp.material, localizationMap);
                  return (
                    <span className="bp-labels">
                      <span className="bp-material">{display.primaryLabel}</span>
                      {display.secondaryLabel && <span className="bp-material-secondary">{display.secondaryLabel}</span>}
                    </span>
                  );
                })()}
                <span className="bp-amount">x{bp.amount}</span>
                {bp.chance && <span className="bp-chance">({bp.chance / 100}%)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasChildren && expanded && <Handle type="source" position={Position.Bottom} className="handle-bottom" />}
    </div>
  );
};
