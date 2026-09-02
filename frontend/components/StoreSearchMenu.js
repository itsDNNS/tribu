import { useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { t } from '../lib/i18n';
import { buildStoreSearchUrl } from '../lib/storeSearch';

function format(messages, key, name) {
  return t(messages, key).replace('{name}', name);
}

export default function StoreSearchMenu({ item, stores, messages, onClose }) {
  const dialogRef = useRef(null);
  const firstLinkRef = useRef(null);
  const previousFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    firstLinkRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') { onCloseRef.current(); return; }
      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll('a[href], button:not(:disabled)');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  const options = stores
    .map((store) => ({ store, result: buildStoreSearchUrl(store.url_template, item.name) }))
    .filter(({ result }) => result);

  return (
    <div className="cal-dialog-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="cal-dialog" role="dialog" aria-modal="true"
        aria-labelledby="store-search-title" aria-describedby="store-search-hint"
        onClick={(event) => event.stopPropagation()}>
        <div id="store-search-title" className="cal-dialog-title">
          {format(messages, 'module.shopping.search_online_title', item.name)}
        </div>
        <div id="store-search-hint" className="cal-dialog-subtitle">
          {t(messages, 'module.shopping.search_online_hint')}
        </div>
        <div className="cal-dialog-actions">
          {options.map(({ store, result }, index) => (
            <a key={store.id} ref={index === 0 ? firstLinkRef : undefined}
              className="btn-ghost store-search-option" href={result.url}
              target="_blank" rel="noopener noreferrer" onClick={onClose}>
              <span>{store.name}</span>
              <span className="store-search-option-host">{result.host}</span>
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          ))}
          <button className="btn-sm cal-dialog-cancel" type="button" onClick={onClose}>
            {t(messages, 'cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
