import { useState, useEffect } from 'react';
import type { PathfinderNode, MaterialNeedNode, RecipeChoiceNode } from './types';
import { ChevronRight, ChevronDown, Package, Zap, Clock, Repeat, Hash, AlertTriangle, CheckCircle, Ban } from 'lucide-react';
import { useTranslation } from './i18n';
import { BUILT_IN_LOCALIZATION, type LocalizationMap, formatMaterialDisplay } from './materialLocalization';
import { getMachineDisplayName, getVoltageTier } from './machines';

interface RecipeNodeProps {
  node: PathfinderNode;
  forceState?: { stamp: number, expand: boolean };
  localizationMap?: LocalizationMap;
}

const RecipeNodeComponent = ({ node, forceState, localizationMap = BUILT_IN_LOCALIZATION }: RecipeNodeProps) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = !!(node.children && node.children.length > 0);

  useEffect(() => {
    if (forceState && forceState.stamp > 0 && hasChildren) {
      setExpanded(forceState.expand);
    }
  }, [forceState, hasChildren]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      setExpanded(!expanded);
    }
  };

  if (node.node_type === 'material_need') {
    return (
      <MaterialNeed
        node={node}
        expanded={expanded}
        toggle={handleToggle}
        hasChildren={hasChildren}
        forceState={forceState}
        localizationMap={localizationMap}
      />
    );
  } else {
    return (
      <RecipeChoice
        node={node as RecipeChoiceNode}
        expanded={expanded}
        toggle={handleToggle}
        hasChildren={hasChildren}
        forceState={forceState}
        localizationMap={localizationMap}
      />
    );
  }
};

const MaterialNeed = ({
  node,
  expanded,
  toggle,
  hasChildren,
  forceState,
  localizationMap,
}: {
  node: MaterialNeedNode,
  expanded: boolean,
  toggle: any,
  hasChildren: boolean,
  forceState?: any,
  localizationMap: LocalizationMap,
}) => {
  const { t, lang } = useTranslation();
  const materialDisplay = formatMaterialDisplay(node.material, localizationMap);
  let statusClass = 'neutral';
  let StatusIcon = AlertTriangle;

  if (node.status === 'source_matched' || node.status === 'satisfied_by_surplus') {
    statusClass = 'success';
    StatusIcon = CheckCircle;
  } else if (node.status === 'blacklisted') {
    statusClass = 'danger';
    StatusIcon = Ban;
  }

  const statusDict: Record<string, string> = {
    'expanded': lang === 'en' ? 'EXPANDED' : '展开计算',
    'source_matched': lang === 'en' ? 'MATCHED' : '成功匹配',
    'blacklisted': lang === 'en' ? 'BLACKLISTED' : '黑名单',
    'no_recipe': lang === 'en' ? 'NO RECIPE' : '无配方',
    'cycle_detected': lang === 'en' ? 'CYCLE' : '循环依赖截断',
    'max_depth_reached': lang === 'en' ? 'MAX DEPTH' : '达最大深度',
    'max_nodes_reached': lang === 'en' ? 'MAX NODES' : '达最大节点',
    'satisfied_by_surplus': lang === 'en' ? 'SURPLUS' : '使用余量'
  };

  return (
    <div className="node-container">
      <div className={`node-row material-need ${statusClass}`} onClick={toggle}>
        <div className="node-icon" onClick={toggle}>
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{width: 14}}/>}
        </div>
        
        <div className="node-name">
          <Package size={14} style={{ color: 'var(--warning-color)' }} />
          <span className="node-name-labels">
            <span>{materialDisplay.primaryLabel}</span>
            {materialDisplay.secondaryLabel && (
              <span className="node-name-secondary">{materialDisplay.secondaryLabel}</span>
            )}
          </span>
          <span className="node-amount">x{node.required_amount}</span>
        </div>

        <div className="node-tags">
          <span className={`status-label ${statusClass}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <StatusIcon size={12} /> {statusDict[node.status] || node.status.replace(/_/g, ' ').toUpperCase()}
          </span>
          {node.status === 'satisfied_by_surplus' && node.satisfied_amount && (
             <span className="status-label success">+{node.satisfied_amount} {t.fromSurplus}</span>
          )}
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="children-container">
          {node.children?.map((child, idx) => (
            <RecipeNodeComponent key={idx} node={child} forceState={forceState} localizationMap={localizationMap} />
          ))}
        </div>
      )}
    </div>
  );
};

const RecipeChoice = ({
  node,
  expanded,
  toggle,
  hasChildren,
  forceState,
  localizationMap,
}: {
  node: RecipeChoiceNode,
  expanded: boolean,
  toggle: any,
  hasChildren: boolean,
  forceState?: any,
  localizationMap: LocalizationMap,
}) => {
  const { t } = useTranslation();
  const tier = getVoltageTier(node.eut);
  const machineName = getMachineDisplayName(node.recipe_id, node.machine_type, localizationMap, tier);
  
  return (
    <div className="node-container">
      <div className="node-row recipe-choice" onClick={toggle}>
        <div className="node-icon" onClick={toggle}>
          {hasChildren ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span style={{width: 14}}/>}
        </div>
        
        <div className="node-name">
          <Repeat size={14} style={{ color: 'var(--primary-color)' }} />
          <span>{machineName}</span>
          <span style={{ color: '#aaa', fontSize: '0.8rem' }}>({node.recipe_id.split('/').pop()})</span>
        </div>

        <div className="node-tags">
          <span className="node-tag node-tag-primary"><Hash size={12} /> {node.runs} {t.runs}</span>
          <span className="node-tag"><Zap size={12} /> {node.eut} EU/t</span>
          <span className="node-tag node-tag-time"><Clock size={12} /> {node.duration} t</span>
        </div>
      </div>

      {expanded && hasChildren && (
        <div className="children-container">
          {node.children?.map((child, idx) => (
            <RecipeNodeComponent key={idx} node={child} forceState={forceState} localizationMap={localizationMap} />
          ))}
        </div>
      )}
    </div>
  );
};

export default RecipeNodeComponent;
