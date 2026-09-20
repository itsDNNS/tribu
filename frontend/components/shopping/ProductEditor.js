import { useShoppingText } from "./useShoppingText";
import { useState } from 'react';
import { Heart, Trash2, Check, X, FileImage } from 'lucide-react';
import ShoppingDialog from './ShoppingDialog';
import { GroceryArt, splitSpec, CATEGORIES, fold } from './catalog';
export default function ProductEditor({
  item,
  lists,
  activeListId,
  categories,
  onSave,
  onDelete,
  onClose,
  favorites,
  onFavorite,
  onStoreSearch
}) {
  const tr = useShoppingText();
  const parsed = splitSpec(item.spec);
  const [draft, setDraft] = useState({
    name: item.name || '',
    qty: parsed.qty,
    unit: parsed.unit,
    category: item.category || 'Sonstiges',
    list_id: item.list_id || activeListId,
    notes: item.notes || parsed.legacy,
    priority: item.priority || 'normal',
    photo: item.photo || null
  });
  const [customCategory, setCustomCategory] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const favorite = favorites.includes(fold(draft.name));
  const change = (key, value) => setDraft(prev => ({
    ...prev,
    [key]: value
  }));
  async function photo(file) {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError(tr("module.shopping.visual.bitte_jpg_png_oder_webp_bis_5_mb_auswahlen"));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 720 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const data = canvas.toDataURL('image/jpeg', .8);
      if (data.length > 700000) throw new Error(tr("module.shopping.visual.das_foto_ist_zu_gro_bitte_ein_kleineres_bild_wahlen"));
      change('photo', data);
    } catch (e) {
      setError(e.message || tr("module.shopping.visual.das_foto_konnte_nicht_geladen_werden"));
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const ok = await onSave({
        ...draft,
        name: draft.name.trim(),
        spec: `${draft.qty}${draft.unit.trim() ? ' ' + draft.unit.trim() : ''}`,
        notes: draft.notes || null
      });
      if (ok !== false) onClose();else setError(tr("module.shopping.visual.speichern_fehlgeschlagen_bitte_erneut_versuchen"));
    } catch {
      setError(tr("module.shopping.visual.speichern_fehlgeschlagen_bitte_erneut_versuchen"));
    } finally {
      setBusy(false);
    }
  }
  return <ShoppingDialog title={item.id ? tr("module.shopping.visual.das_richtige_lieblingsding") : tr("module.shopping.visual.was_fehlt_euch_noch")} onClose={onClose} actions={<>{item.id && <button className="btn danger" disabled={busy} onClick={onDelete}><Trash2 size={14} />{tr("module.shopping.visual.loschen")}</button>}<span className="grow" />{onStoreSearch && <button className="btn" onClick={onStoreSearch}>{tr("module.shopping.visual.online_suchen")}</button>}<button className="btn" disabled={busy} onClick={onClose}>{tr("module.shopping.visual.abbrechen")}</button><button className="btn primary" type="submit" form="shop-product-form" disabled={busy}><Check size={14} />{tr("module.shopping.visual.speichern")}</button></>}>
 <form id="shop-product-form" className="shop-fields" onSubmit={save}>
 <div className="field full"><div className="shop-detail-preview">{draft.photo ? <img className="shop-product-photo" src={draft.photo} alt="" /> : <GroceryArt name={draft.name} />}<div><strong>{draft.name || tr("module.shopping.visual.neuer_artikel")}</strong><p>{tr("module.shopping.visual.menge_wunschmarke_und_kleine_details")}</p></div><button type="button" className={`shop-favorite-toggle ${favorite ? 'active' : ''}`} onClick={() => onFavorite(draft.name)} aria-label={favorite ? tr("module.shopping.visual.favorit_entfernen") : tr("module.shopping.visual.favorit_speichern")} aria-pressed={favorite}><Heart size={20} /></button></div></div>
 <label className="field full">{tr("module.shopping.visual.artikel")}<input required autoFocus maxLength={160} value={draft.name} onChange={e => change('name', e.target.value)} placeholder={tr("module.shopping.visual.zum_beispiel_milch")} /></label>
 <label className="field">{tr("module.shopping.visual.menge")}<input required type="number" min="0.001" max="99999" step="0.001" inputMode="decimal" value={draft.qty} onChange={e => change('qty', e.target.value)} /></label>
 <label className="field">{tr("module.shopping.visual.einheit")}<input value={draft.unit} maxLength={20} onChange={e => change('unit', e.target.value)} placeholder={tr("module.shopping.visual.z_b_kg_l_stuck")} list="shop-units" /></label>
 <datalist id="shop-units">{['Stück', 'g', 'kg', 'ml', 'l', 'Packung', 'Dose', 'Flaschen', 'EL', 'TL'].map(v => <option key={v} value={v} />)}</datalist>
 <label className="field">{tr("module.shopping.visual.kategorie")}<select value={customCategory ? '__custom__' : draft.category} onChange={e => { if(e.target.value === '__custom__'){setCustomCategory(true);change('category','');}else{setCustomCategory(false);change('category',e.target.value);} }}>{[...new Set([...CATEGORIES, ...categories, draft.category])].filter(Boolean).map(v => <option key={v}>{v}</option>)}<option value="__custom__">{tr('module.shopping.visual.custom_category')}</option></select>{customCategory&&<input aria-label={tr('module.shopping.visual.custom_category')} required maxLength={100} autoFocus value={draft.category} onChange={e=>change('category',e.target.value)}/>}</label>
 <datalist id="shop-categories">{[...new Set([...CATEGORIES, ...categories])].map(v => <option key={v} value={v} />)}</datalist>
 <label className="field">{tr("module.shopping.visual.einkaufsliste")}<select value={draft.list_id} onChange={e => change('list_id', Number(e.target.value))}>{lists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
 <label className="field full">{tr("module.shopping.visual.details_fur_die_familie")}<input maxLength={500} value={draft.notes} onChange={e => change('notes', e.target.value)} placeholder={tr("module.shopping.visual.zum_beispiel_1_5_fett_oder_die_lieblingsmarke")} /></label>
 <label className="field full">{tr("module.shopping.visual.dringlichkeit")}<select value={draft.priority} onChange={e => change('priority', e.target.value)}><option value="normal">{tr("module.shopping.visual.beim_nachsten_einkauf")}</option><option value="urgent">{tr("module.shopping.visual.dringend")}</option></select></label>
 <div className="field full"><label htmlFor="shop-photo-file">{tr("module.shopping.visual.produktfoto_optional")}</label><div className="shop-photo-area"><span>{draft.photo ? <img src={draft.photo} alt={tr("module.shopping.visual.produktfoto")} /> : <FileImage size={20} />}</span><div className="grow"><input id="shop-photo-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => photo(e.target.files[0])} /><p>{tr("module.shopping.visual.fur_eure_familie_gespeichert_jpg_png_oder_webp_maximal_")}</p></div><button type="button" className="icon-button bare tiny" aria-label={tr("module.shopping.visual.foto_entfernen")} onClick={() => change('photo', null)}><X size={15} /></button></div></div>
 {error && <p role="alert" className="shop-error full">{error}</p>}
 </form></ShoppingDialog>;
}
