import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { searchDictionary } from '../../utils/search';
import type { SearchResult } from '../../types';

const fieldLabel: Record<SearchResult['matchedField'], string> = {
  name: '名称',
  alias: '別名',
  package: 'パッケージ名',
  summary: '概要',
};

export function DictionarySearch() {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = searchDictionary(query);

  useEffect(() => {
    setIsOpen(false);
    setQuery('');
  }, [location.pathname]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setIsOpen(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  const close = () => {
    setIsOpen(false);
    setActiveIndex(0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close();
      inputRef.current?.blur();
      return;
    }
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    }
    if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      navigate(results[activeIndex].href);
      close();
      inputRef.current?.blur();
    }
  };

  return (
    <div className="search-wrap">
      <label className="search-label" htmlFor="dictionary-search">
        <span className="search-icon" aria-hidden="true" />
        <span className="sr-only">Dictionaryを検索</span>
      </label>
      <input
        ref={inputRef}
        id="dictionary-search"
        className="search-input"
        type="search"
        placeholder="技術や分類を検索"
        value={query}
        autoComplete="off"
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen && query.trim().length > 0}
        aria-controls="dictionary-search-results"
        role="combobox"
        aria-autocomplete="list"
      />
      <kbd className="search-shortcut">⌘ / Ctrl K</kbd>
      {isOpen && query.trim() && (
        <div className="search-popover" id="dictionary-search-results" role="listbox" aria-label="検索結果">
          {results.length > 0 ? (
            results.map((result, index) => (
              <Link
                key={`${result.kind}-${result.id}`}
                to={result.href}
                role="option"
                aria-selected={index === activeIndex}
                className={`search-result${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={close}
              >
                <span className="result-main">
                  <span className="result-heading">
                    <span className="result-name">{result.name}</span>
                    <span className={`result-kind result-kind-${result.kind}`}>{result.kind === 'stack' ? '技術' : '分類'}</span>
                  </span>
                  <span className="result-summary">{result.summary}</span>
                  {(result.matchedField === 'alias' || result.matchedField === 'package') && (
                    <span className="result-match">{fieldLabel[result.matchedField]}で一致</span>
                  )}
                </span>
              </Link>
            ))
          ) : (
            <p className="search-empty">該当する項目がありません。</p>
          )}
          <p className="search-help">↑↓で移動・Enterで開く・Escで閉じる</p>
        </div>
      )}
    </div>
  );
}
