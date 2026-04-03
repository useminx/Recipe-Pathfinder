import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { searchMaterialSuggestions } from './materialLocalization';
import type { MaterialSuggestion } from './types';

interface MaterialSearchInputProps {
  value: string;
  suggestions: MaterialSuggestion[];
  placeholder: string;
  onChange: (value: string) => void;
  onDraftChange?: (value: string) => void;
  onDraftMatchChange?: (matchesCommittedValue: boolean) => void;
  className?: string;
}

const MaterialSearchInput = ({
  value,
  suggestions,
  placeholder,
  onChange,
  onDraftChange,
  onDraftMatchChange,
  className = 'form-control',
}: MaterialSearchInputProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [draftValue, setDraftValue] = useState(value);

  const filteredSuggestions = searchMaterialSuggestions(suggestions, draftValue);
  const isEnglishMode = draftValue.trim().startsWith('#');

  useEffect(() => {
    setDraftValue(value);
    onDraftChange?.(value);
    onDraftMatchChange?.(true);
  }, [value, onDraftChange, onDraftMatchChange]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [draftValue]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, []);

  const selectSuggestion = (suggestion: MaterialSuggestion) => {
    setDraftValue(suggestion.rawId);
    onDraftChange?.(suggestion.rawId);
    onChange(suggestion.rawId);
    onDraftMatchChange?.(true);
    setIsOpen(false);
  };

  const revertToCommittedValue = () => {
    setDraftValue(value);
    onDraftChange?.(value);
    onDraftMatchChange?.(true);
    setHighlightedIndex(-1);
    setIsOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!filteredSuggestions.length) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, filteredSuggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex((current) => Math.max(current - 1, 0));
      return;
    }

    if (event.key === 'Enter' && isOpen && highlightedIndex >= 0) {
      const highlighted = filteredSuggestions[highlightedIndex];
      if (highlighted) {
        event.preventDefault();
        selectSuggestion(highlighted);
      }
      return;
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="material-search" ref={rootRef}>
      <input
        type="text"
        className={className}
        value={draftValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
          onDraftChange?.(event.target.value);
          onDraftMatchChange?.(event.target.value === value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!rootRef.current?.contains(document.activeElement)) {
              revertToCommittedValue();
            }
          }, 0);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {isOpen && (
        <div className="material-search-dropdown" role="listbox">
          {filteredSuggestions.length === 0 ? (
            <div className="material-search-empty">No matching materials</div>
          ) : (
            filteredSuggestions.map((suggestion, index) => {
              const isHighlighted = index === highlightedIndex;

              return (
                <button
                  key={suggestion.rawId}
                  type="button"
                  className={`material-search-option ${isHighlighted ? 'active' : ''}`}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSuggestion(suggestion);
                  }}
                >
                  {isEnglishMode ? (
                    <span className="material-search-option-english">{suggestion.rawId}</span>
                  ) : (
                    <>
                      <span className="material-search-option-primary">
                        {suggestion.kind === 'machine' ? (
                          <span className="material-search-option-kind">机器</span>
                        ) : null}
                        {suggestion.primaryLabel}
                      </span>
                      {suggestion.secondaryLabel && (
                        <span className="material-search-option-secondary">{suggestion.secondaryLabel}</span>
                      )}
                    </>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default MaterialSearchInput;
