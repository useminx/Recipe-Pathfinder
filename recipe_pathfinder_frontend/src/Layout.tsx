import { useState } from 'react';
import { Menu, FileText, Download, Activity, Globe } from 'lucide-react';
import Sidebar from './Sidebar';
import RecipeViewer from './RecipeViewer';
import type { LocalizationPack, PathfinderResponse } from './types';
import { useTranslation } from './i18n';
import type { LocalizationMap } from './materialLocalization';

interface LayoutProps {
  data: PathfinderResponse | null;
  localizationMap: LocalizationMap;
  localizationPacks: LocalizationPack[];
  updateLocalizationPacks: (packs: LocalizationPack[]) => void;
  onCopySuccess: () => void;
  onSearch: (params: import('./types').PathfinderRequest) => void;
  onClear: () => void;
}

const Layout = ({
  data,
  localizationMap,
  localizationPacks,
  updateLocalizationPacks,
  onCopySuccess,
  onSearch,
  onClear,
}: LayoutProps) => {
  const [collapsed, setCollapsed] = useState(false);
  const { t, lang, setLang } = useTranslation();

  const toggleSidebar = () => setCollapsed(!collapsed);
  const toggleLanguage = () => setLang(lang === 'zh' ? 'en' : 'zh');

  return (
    <div className="app-container">
      <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <Sidebar 
          data={data} 
          localizationMap={localizationMap}
          localizationPacks={localizationPacks}
          onChangeLocalizationPacks={updateLocalizationPacks}
          onSearch={onSearch} 
          onClear={onClear} 
        />
      </div>
      
      <main className="main-content">
        <header className="header">
          <button className="hamburger" onClick={toggleSidebar} title="Toggle Sidebar">
            <Menu size={24} />
          </button>
          <div style={{ flex: 1 }}></div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button 
              className="btn-secondary" 
              onClick={toggleLanguage} 
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', border: 'none' }}
              title="Switch Language"
            >
              <Globe size={18} />
              {t.toggleLang}
            </button>

            {data && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--success-color)', fontSize: '0.85rem', fontWeight: 500 }}>
                  <Activity size={16} />
                  {data.summary.search_duration_ms}ms
                </div>
                <button className="btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={() => {
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'pathfinder-results.json';
                  a.click();
                }}>
                  <Download size={16} />
                  {t.exportJson}
                </button>
              </>
            )}
          </div>
        </header>

        <section className="document-area">
          {!data ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', gap: '1rem' }}>
              <FileText size={64} style={{ opacity: 0.2 }} />
              <h2>{t.noOutputYet}</h2>
              <p>{t.configureSearch}</p>
            </div>
          ) : (
            <RecipeViewer response={data} localizationMap={localizationMap} onCopySuccess={onCopySuccess} />
          )}
        </section>
      </main>
    </div>
  );
};

export default Layout;
