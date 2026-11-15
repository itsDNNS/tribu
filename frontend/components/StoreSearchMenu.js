import { useRef } from 'react';
import { ExternalLink } from 'lucide-react';
import { t } from '../lib/i18n';
import { buildStoreSearchUrl } from '../lib/storeSearch';
import { inBody } from './inBody';
import ModalDialog from './ModalDialog';

function format(messages, key, name) {
  return t(messages, key).replace('{name}', name);
}

export default function StoreSearchMenu({ item, stores, messages, onClose }) {
  const firstLinkRef = useRef(null);

  const options = stores
    .map((store) => ({ store, result: buildStoreSearchUrl(store.url_template, item.name) }))
    .filter(({ result }) => result);

  return inBody(
    <ModalDialog className="ui-modal cal-dialog" onClose={onClose} initialFocusRef={firstLinkRef}
      aria-labelledby="store-search-title" aria-describedby="store-search-hint">
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
    </ModalDialog>
  );
}
