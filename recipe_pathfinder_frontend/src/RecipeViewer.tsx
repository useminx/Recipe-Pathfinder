

import type { PathfinderResponse } from './types';
import FlowViewer from './FlowViewer';
import './RecipeViewer.css';
import { useTranslation } from './i18n';
import type { LocalizationMap } from './materialLocalization';

interface RecipeViewerProps {
  response: PathfinderResponse;
  localizationMap: LocalizationMap;
  onCopySuccess: () => void;
}

const RecipeViewer = ({ response, localizationMap, onCopySuccess }: RecipeViewerProps) => {
  const { summary, trees } = response;
  const { t, lang } = useTranslation();
  const successfulCount = summary.fully_resolved_count + summary.partially_resolved_count;
  const successfulLabel = lang === 'zh' ? '解析成功' : 'Successful';

  return (
    <div className="recipe-viewer">
      
      {/* Summary Header */}
      <div className="summary-card">
        <div>
          <h1 style={{ marginBottom: '0.2rem' }}>{t.searchResults}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            {t.foundCandidateTrees(summary.tree_count, summary.search_duration_ms)}
          </p>
        </div>
        <div className="summary-stats">
          <div className="stat-pill success">
            <span className="stat-value">{successfulCount}</span>
            <span className="stat-label">{successfulLabel}</span>
          </div>
          <div className="stat-pill neutral">
            <span className="stat-value">{summary.surplus_satisfied_count}</span>
            <span className="stat-label">{t.surplusMatches}</span>
          </div>
        </div>
      </div>

      <hr className="divider" />

      {/* Trees display */}
      <div className="trees-container">
        {trees.map((tree, idx) => (
          <div key={idx} id={`recipe-tree-${idx}`} className="tree-card">
            
            <div className="tree-header">
              <div className="tree-title">
                <h2>{t.recipeTree} #{idx + 1}</h2>
                <span className="status-badge status-ok">
                  {successfulLabel}
                </span>
              </div>
              <div className="tree-metrics">
                <span><strong>{t.steps}:</strong> {tree.metrics.step_count}</span>
                <span><strong>EUt:</strong> {tree.metrics.total_eut}</span>
                <span><strong>{t.time}:</strong> {tree.metrics.total_duration}t</span>
              </div>
            </div>

            <div className="tree-body" style={{ padding: 0 }}>
              <FlowViewer tree={tree} localizationMap={localizationMap} onCopySuccess={onCopySuccess} />
            </div>

          </div>
        ))}
      </div>

    </div>
  );
};

export default RecipeViewer;
