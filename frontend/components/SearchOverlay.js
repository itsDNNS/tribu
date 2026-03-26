import { useCallback, useEffect, useRef, useState } from 'react';
import { Calendar, CheckSquare, ShoppingCart, Users, Cake, Search, X } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import * as api from '../lib/api';

const MODULE_META = {
  calendar: { icon: Calendar, label: 'module.calendar.name', view: 'calendar' },
  tasks: { icon: CheckSquare, label: 'module.tasks.name', view: 'tasks' },
  shopping: { icon: ShoppingCart, label: 'module.shopping.name', view: 'shopping' },
  contacts: { icon: Users, label: 'module.contacts.name', view: 'contacts' },
  birthdays: { icon: Cake, label: 'module.birthdays.name', view: 'calendar' },
};

export default function SearchOverlay({ open, onClose }) {
  const { familyId, messages, setActiveView } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
    if (!open) {
      setQuery('');
      setResults(null);
      setLoading(false);
      reqIdRef.current++;
    }
  }, [open]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults(null);
      return;
    }
    const id = ++reqIdRef.current;
    setLoading(true);
    const { ok, data } = await api.apiSearch(familyId, q);
    if (id !== reqIdRef.current) return;
    if (ok) setResults(data);
    setLoading(false);
  }, [familyId]);

  const handleInput = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleResultClick = (view) => {
    setActiveView(view);
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
  };

  if (!open) return null;

  const hasResults = results && Object.keys(results).length > 0;
  const noResults = results && Object.keys(results).length === 0 && query.length >= 2;

  return (
    <div className="search-overlay" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="search-panel" onClick={(e) => e.stopPropagation()}>
        <div className="search-header">
          <Search size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder={t(messages, 'search.placeholder')}
            value={query}
            onChange={handleInput}
            autoComplete="off"
          />
          <button className="search-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="search-results">
          {loading && <div className="search-loading">{t(messages, 'search.searching')}</div>}

          {noResults && !loading && (
            <div className="search-empty">{t(messages, 'search.no_results').replace('{query}', query)}</div>
          )}

          {hasResults && !loading && Object.entries(results).map(([module, items]) => {
            const meta = MODULE_META[module];
            if (!meta || !items.length) return null;
            const Icon = meta.icon;
            return (
              <div key={module} className="search-group">
                <div className="search-group-header">
                  <Icon size={14} />
                  <span>{t(messages, meta.label)}</span>
                </div>
                {items.map((item) => (
                  <button
                    key={`${module}-${item.id}`}
                    className="search-result-item"
                    onClick={() => handleResultClick(meta.view)}
                  >
                    {item.color && <div className="search-dot" style={{ background: item.color }} />}
                    <span>{item.title || item.name || item.full_name || item.person_name}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
