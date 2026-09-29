import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import * as api from '../../lib/api';
import { errorText } from '../../lib/helpers';
import { t } from '../../lib/i18n';
import { builtinCategory, categoryLabel, fold } from './catalog';
import { useShoppingText } from './useShoppingText';

// "Categories" in the list menu (#512): the family's switch for sorting by
// category, this list's order through the shop, and renaming or deleting
// the family's own categories.
export default function CategoriesSheet({ order, busy, onSaveOrder, onChanged }) {
  const tr = useShoppingText();
  const { messages, familyId, demoMode, shoppingCategories = true, setShoppingCategories } = useApp();
  const { error: toastError } = useToast();
  const [draft, setDraft] = useState(order);
  const [usage, setUsage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [working, setWorking] = useState(false);
  const fail = (data) => toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));

  useEffect(() => {
    if (!familyId || demoMode) return undefined;
    let cancelled = false;
    api.apiGetShoppingCategoryUsage(familyId).then(({ ok, data }) => {
      if (!cancelled && ok) setUsage(data);
    });
    return () => { cancelled = true; };
  }, [familyId, demoMode]);

  async function toggle() {
    const next = !shoppingCategories;
    setShoppingCategories(next);
    if (demoMode) return;
    setWorking(true);
    const { ok, data } = await api.apiSetShoppingCategories(familyId, next);
    setWorking(false);
    if (!ok) {
      setShoppingCategories(!next);
      fail(data);
    }
  }

  // A renamed or deleted category also changes this list's order.
  async function change(request, from, to = null) {
    setWorking(true);
    const { ok, data } = await request();
    setWorking(false);
    if (!ok) return fail(data);
    setUsage(data);
    // The server may file the new name under an existing spelling.
    const stored = to && (data.find((entry) => fold(entry.name) === fold(to)) || data.find((entry) => entry.builtin && entry.builtin === builtinCategory(to)));
    const target = stored ? stored.name : to;
    setDraft((current) => [...new Set(current.map((entry) => (entry === from ? target : entry)).filter(Boolean))]);
    setEditing(null);
    setDeleting(null);
    onChanged();
  }

  const own = (usage || []).filter((entry) => !entry.builtin);
  return (
    <div className="shop-categories">
      <div className="shop-categories-switch">
        <span className="grow">
          <strong>{tr('module.shopping.categories.use')}</strong>
          <small>{tr('module.shopping.categories.use_hint')}</small>
        </span>
        <button
          type="button"
          role="switch"
          className="ms-switch"
          aria-label={tr('module.shopping.categories.use')}
          aria-checked={shoppingCategories}
          disabled={working}
          onClick={toggle}
        ><span /></button>
      </div>

      {shoppingCategories && <>
        <h4>{tr('module.shopping.categories.own')}</h4>
        <p>{tr('module.shopping.categories.own_hint')}</p>
        {usage && !own.length && <p className="shop-categories-empty">{tr('module.shopping.categories.own_empty')}</p>}
        <div className="shop-categories-own">{own.map((entry) => <div className="shop-sort-row" key={entry.name} data-testid="shop-own-category">
          {editing === entry.name ? <form className="shop-categories-rename" onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) change(() => api.apiRenameShoppingCategory(familyId, entry.name, name.trim()), entry.name, name.trim());
          }}>
            <input autoFocus required maxLength={100} value={name} aria-label={tr('module.shopping.categories.new_name')} onChange={(event) => setName(event.target.value)} />
            <button type="button" className="btn small" onClick={() => setEditing(null)}>{tr('module.shopping.visual.abbrechen')}</button>
            <button className="btn small primary" disabled={working}>{tr('module.shopping.visual.speichern')}</button>
          </form> : deleting === entry.name ? <div className="shop-categories-confirm">
            <span className="grow">{tr('module.shopping.categories.delete_confirm', [entry.name])}</span>
            <button type="button" className="btn small" onClick={() => setDeleting(null)}>{tr('module.shopping.visual.abbrechen')}</button>
            <button type="button" className="btn small danger" disabled={working} onClick={() => change(() => api.apiDeleteShoppingCategory(familyId, entry.name), entry.name)}>{tr('module.shopping.visual.loschen')}</button>
          </div> : <>
            <span className="grow">{entry.name}<small>{tr('module.shopping.categories.items', [entry.items])}</small></span>
            <button type="button" className="btn small" aria-label={tr('module.shopping.categories.rename', [entry.name])} onClick={() => { setEditing(entry.name); setName(entry.name); setDeleting(null); }}><Pencil size={14} /></button>
            <button type="button" className="btn small" aria-label={tr('module.shopping.categories.delete', [entry.name])} onClick={() => { setDeleting(entry.name); setEditing(null); }}><Trash2 size={14} /></button>
          </>}
        </div>)}</div>

        <h4>{tr('module.shopping.visual.so_geht_ihr_durch_den_laden')}</h4>
        <p>{tr('module.shopping.visual.ordnet_die_abteilungen_passend_zu_eurem_supermarkt_leer')}</p>
        <div className="shop-sort-list">{draft.map((category, index) => {
          const label = categoryLabel(category, tr);
          return <div className="shop-sort-row" key={category}><span className="grow">{label}</span>{[-1, 1].map((direction) => <button key={direction} className="btn small" disabled={index + direction < 0 || index + direction >= draft.length} aria-label={tr('module.shopping.visual.0_nach_1', [label, direction < 0 ? tr('module.shopping.visual.oben') : tr('module.shopping.visual.unten')])} onClick={() => {
            const next = [...draft];
            [next[index], next[index + direction]] = [next[index + direction], next[index]];
            setDraft(next);
          }}>{direction < 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button>)}</div>;
        })}</div>
        <button className="btn primary" disabled={busy} onClick={() => onSaveOrder(draft)}>{tr('module.shopping.visual.reihenfolge_speichern')}</button>
      </>}
    </div>
  );
}
