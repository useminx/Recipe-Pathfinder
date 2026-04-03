import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import Layout from './Layout';

import { solveRecipeTree } from './api';
import { getCopyToastStyle, rescheduleDismissTimer } from './copyToast';
import { LanguageContext, translations } from './i18n';
import type { Language } from './i18n';
import {
  buildMergedLocalizationMap,
  loadLocalizationPacks,
  saveLocalizationPacks,
} from './localizationPacks';
import { BUILT_IN_LOCALIZATION } from './materialLocalization';
import type { LocalizationPack, PathfinderRequest, PathfinderResponse } from './types';

function App() {
  const [data, setData] = useState<PathfinderResponse | null>(null);
  const [lang, setLang] = useState<Language>('zh');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyToastVisible, setCopyToastVisible] = useState(false);
  const [copyToastKey, setCopyToastKey] = useState(0);
  const [localizationPacks, setLocalizationPacks] = useState<LocalizationPack[]>(() => loadLocalizationPacks());
  const copyToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const localizationMap = useMemo(
    () => buildMergedLocalizationMap(BUILT_IN_LOCALIZATION, localizationPacks),
    [localizationPacks],
  );

  const updateLocalizationPacks = (next: LocalizationPack[]) => {
    setLocalizationPacks(next);
    saveLocalizationPacks(next);
  };

  const handleSearch = async (params: PathfinderRequest) => {
    setLoading(true);
    setError(null);
    try {
      const result = await solveRecipeTree(params);
      setData(result);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Unknown error occurred');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const clearData = () => {
    setData(null);
    setError(null);
  };

  const handleCopySuccess = useCallback(() => {
    setCopyToastVisible(true);
    setCopyToastKey((prev) => prev + 1);
    copyToastTimerRef.current = rescheduleDismissTimer(copyToastTimerRef.current, () => {
      setCopyToastVisible(false);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (copyToastTimerRef.current !== null) {
        clearTimeout(copyToastTimerRef.current);
      }
    };
  }, []);

  const contextValue = {
    lang,
    setLang,
    t: translations[lang],
  };

  return (
    <LanguageContext.Provider value={contextValue}>
      <Layout
        data={data}
        localizationMap={localizationMap}
        localizationPacks={localizationPacks}
        updateLocalizationPacks={updateLocalizationPacks}
        onCopySuccess={handleCopySuccess}
        onSearch={handleSearch}
        onClear={clearData}
      />

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
          <div>Loading recipes...</div>
        </div>
      )}

      {error && (
        <div className="error-toast" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      {copyToastVisible && (
        <div key={copyToastKey} className="copy-toast" style={getCopyToastStyle()}>
          {lang === 'en' ? 'Copied' : '复制成功'}
        </div>
      )}
    </LanguageContext.Provider>
  );
}

export default App;
