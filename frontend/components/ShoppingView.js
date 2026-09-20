import { useShoppingText } from "./shopping/useShoppingText";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Check, X, ShoppingCart, Search, Heart, Coffee, ShoppingBag, House, MoreVertical, Upload, ArrowRight, Grid2X2, List, SlidersHorizontal, ShieldCheck, Info, CheckCircle, ChevronDown, ArrowUp, ArrowDown, BookOpen, Menu, Copy, Download } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useShopping } from '../hooks/useShopping';
import { useToast } from '../contexts/ToastContext';
import * as api from '../lib/api';
import CalendarTopbar from './calendar/CalendarTopbar';
import MemberAvatar from './MemberAvatar';
import StoreSearchMenu from './StoreSearchMenu';
import { buildStoreSearchUrl } from '../lib/storeSearch';
import ShoppingDialog from './shopping/ShoppingDialog';
import ProductEditor from './shopping/ProductEditor';
import ProductTile from './shopping/ProductTile';
import { ShoppingTemplateForm, ShoppingTemplateCard } from './shopping/ShoppingTemplates';
import { CATEGORIES, SHOP_CATALOG, GroceryArt, fold, parseProduct, groupShoppingItems } from './shopping/catalog';
const ICONS = {
  cart: ShoppingCart,
  heart: Heart,
  coffee: Coffee,
  bag: ShoppingBag,
  home: House
};
const DEFAULT_PREFS = {
  layout: 'tiles',
  doneOpen: false,
  favorites: ['milch', 'bananen', 'kaffee', 'mineralwasser', 'orangen', 'kase', 'brot', 'zahnpasta', 'avocado'],
  tab: 'favorites'
};
function ListIcon({
  name = 'cart',
  ...props
}) {
  const Icon = ICONS[name] || ShoppingCart;
  return <Icon className="icon" {...props} />;
}
export default function ShoppingView(props) {
  const tr = useShoppingText();
  const {
    members = [],
    messages = {},
    isChild,
    demoMode,
    familyId,
    me,
    setActiveView
  } = useApp();
  const sh = useShopping();
  const toast = useToast();
  const [prefs, setPrefs] = useState(DEFAULT_PREFS),
    [trip, setTrip] = useState(false),
    [urgent, setUrgent] = useState(false),
    [query, setQuery] = useState(''),
    [focused, setFocused] = useState(false),
    [suggestion, setSuggestion] = useState(-1),
    [category, setCategory] = useState('all'),
    [limit, setLimit] = useState(12),
    [modal, setModal] = useState(null),
    [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [recipes, setRecipes] = useState([]),
    [selectedRecipe, setSelectedRecipe] = useState(null),
    [storeItem, setStoreItem] = useState(null);
  const key = `tribu_shopping_ui:${demoMode ? 'demo' : familyId}:${me?.id || 'user'}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      setPrefs({
        ...DEFAULT_PREFS,
        ...saved,
        favorites: Array.isArray(saved.favorites) ? saved.favorites : DEFAULT_PREFS.favorites
      });
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  }, [key]);
  const preference = patch => setPrefs(previous => {
    const next = {
      ...previous,
      ...patch
    };
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {}
    return next;
  });
  useEffect(() => {
    setModal(null);
    setUrgent(false);
    setQuery('');
    setError('');
  }, [sh.activeListId, familyId]);
  useEffect(() => {
    let cancelled = false;
    setRecipes([]);
    setSelectedRecipe(null);
    if (demoMode || !familyId) return;
    const date = new Date().toLocaleDateString('en-CA');
    Promise.all([api.apiListRecipes(familyId), api.apiListMealPlans(familyId, date, date)]).then(([r, m]) => {
      if (cancelled) return;
      const all = Array.isArray(r.data) ? r.data : r.data?.items || [];
      setRecipes(all);
      const plans = Array.isArray(m.data) ? m.data : m.data?.items || [];
      setSelectedRecipe(all.find(recipe => plans.some(plan => plan.recipe_id === recipe.id)) || null);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [familyId, demoMode]);
  const open = sh.uncheckedItems || [],
    done = sh.checkedItems || [],
    items = sh.items || [],
    list = sh.activeList;
  const pct = open.length + done.length ? Math.round(done.length / (open.length + done.length) * 100) : 0;
  const groups = groupShoppingItems(urgent ? open.filter(i => i.priority === 'urgent') : open, list?.category_order || []);
  const products = useMemo(() => {
    const all = [...SHOP_CATALOG];
    const seen = new Set(all.map(p => fold(p.name)));
    for (const item of items) {
      if (!seen.has(fold(item.name))) {
        all.push({
          ...item,
          id: `custom-${item.id}`
        });
        seen.add(fold(item.name));
      }
    }
    return all;
  }, [items]);
  const parsed = useMemo(() => parseProduct(query), [query]);
  const suggestions = query.trim() ? products.filter(p => fold(p.name).includes(fold(parsed.name)) || fold(p.aliases).includes(fold(parsed.name))).slice(0, 7) : [];
  const stores = (sh.storeLinks || []).filter(link => buildStoreSearchUrl(link.url_template, 'x'));
  const recent = [...items.filter(i => i.checked)].sort((a, b) => String(b.checked_at || '').localeCompare(String(a.checked_at || ''))).filter((item, index, array) => array.findIndex(p => fold(p.name) === fold(item.name)) === index);
  const available = prefs.tab === 'favorites' ? products.filter(p => prefs.favorites.includes(fold(p.name))) : prefs.tab === 'recent' ? recent : products.filter(p => category === 'all' || p.category === category);
  const close = () => {
    setModal(null);
    setDraft(null);
    setError('');
  };
  const show = (name, value) => {
    setError('');
    setModal(name);
    setDraft(value);
  };
  const favorite = name => {
    const id = fold(name);
    if (!id) return;
    preference({
      favorites: prefs.favorites.includes(id) ? prefs.favorites.filter(p => p !== id) : [...prefs.favorites, id]
    });
  };
  const edit = item => show('product', item);
  async function run(action, after = close) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const ok = await action();
      if (ok !== false) after();else setError(tr("module.shopping.visual.das_hat_nicht_geklappt_bitte_erneut_versuchen"));
    } catch {
      setError(tr("module.shopping.visual.das_hat_nicht_geklappt_bitte_erneut_versuchen"));
    } finally {
      setBusy(false);
    }
  }
  async function add(product, fromSearch = false) {
    if (isChild || !list || busy || !product.name.trim()) return;
    if (product.invalid || (fromSearch && parsed.invalid)) {setError(tr("module.shopping.visual.invalid_quantity"));return;}
    const existing = open.find(i => fold(i.name) === fold(product.name));
    if (existing && !fromSearch) {
      edit(existing);
      return;
    }
    const payload = {
      name: product.name,
      spec: product.spec || `${product.qty || 1}${product.unit ? ' ' + product.unit : ''}`,
      category: product.category || 'Sonstiges',
      ...(product.notes ? {
        notes: product.notes
      } : {}),
      ...(product.photo ? {
        photo: product.photo
      } : {}),
      ...(product.priority ? {
        priority: product.priority
      } : {})
    };
    await run(() => sh.addProduct(payload), () => {
      setQuery('');
      setFocused(false);
      setSuggestion(-1);
      toast.success(tr("module.shopping.visual.0_ist_auf_eurer_liste", [product.name]));
    });
  }
  const layout = prefs.layout === 'list' ? 'shop-line-list' : 'shop-tile-grid';
  const tiles = entries => <div className={layout}>{entries.map(item => <ProductTile key={item.id} item={item} pending={sh.pendingItemIds?.has(item.id)} onToggle={sh.toggleItem} onEdit={isChild ? null : edit} />)}</div>;
  function discovery() {
    return <>
 <div className="shop-discovery-tabs" role="group" aria-label={tr("module.shopping.visual.artikel_entdecken")}>{[['favorites', tr("module.shopping.visual.favoriten")], ['catalog', tr("module.shopping.visual.katalog")], ['recent', tr("module.shopping.visual.zuletzt")]].map(([tab, label]) => <button key={tab} className={prefs.tab === tab ? 'active' : ''} aria-pressed={prefs.tab === tab} onClick={() => {
          preference({
            tab
          });
          setLimit(12);
        }}>{label}</button>)}</div>
 {prefs.tab === 'catalog' && <select className="shop-catalog-filter" aria-label={tr("module.shopping.visual.artikelkategorie")} value={category} onChange={e => {
        setCategory(e.target.value);
        setLimit(12);
      }}><option value="all">{tr("module.shopping.visual.alle_kategorien")} {products.length} {tr("module.shopping.visual.artikel")}</option>{[...new Set([...CATEGORIES, ...products.map(p => p.category).filter(Boolean)])].map(c => <option key={c}>{c}</option>)}</select>}
 <div className="shop-catalog-grid">{available.slice(0, limit).map(product => {
          const on = open.some(i => fold(i.name) === fold(product.name));
          return <button key={product.id} className={`shop-catalog-item ${on ? 'on-list' : ''}`} disabled={busy || !list || isChild} onClick={() => add(product)} aria-label={`${product.name}${on ? tr("module.shopping.visual.bereits_auf_der_liste") : tr("module.shopping.visual.hinzufugen")}`}><span className="catalog-mark">{on ? <Check size={12} /> : '+'}</span><GroceryArt name={product.name} art={product.art} /><span className="catalog-name">{product.name}</span>{on && <small>{tr("module.shopping.visual.auf_der_liste")}</small>}</button>;
        })}</div>
 {!available.length && <div className="shop-catalog-empty">{prefs.tab === 'favorites' ? tr("module.shopping.visual.markiert_lieblingsartikel_uber_das_herz_in_den_artikeld") : prefs.tab === 'recent' ? tr("module.shopping.visual.gekaufte_artikel_erscheinen_hier_zum_schnellen_wiederve") : tr("module.shopping.visual.in_dieser_kategorie_gibt_es_noch_keine_artikel")}</div>}
 {available.length > limit && <button className="shop-catalog-more" onClick={() => setLimit(limit + 12)}>{tr("module.shopping.visual.weitere")} {Math.min(12, available.length - limit)} {tr("module.shopping.visual.anzeigen")}</button>}
 <div className="shop-catalog-bottom"><span>{prefs.tab === 'favorites' ? tr("module.shopping.visual.eure_gespeicherten_lieblingsartikel") : prefs.tab === 'recent' ? tr("module.shopping.visual.wiederverwenden_statt_neu_schreiben") : tr("module.shopping.visual.0_artikel_im_katalog", [available.length])}</span>{!isChild && <button disabled={!list} onClick={() => edit({})}>{tr("module.shopping.visual.eigener_artikel")} <Plus className="icon xs" /></button>}</div></>;
  }
  function openSort() {
    show('sort', [...new Set([...(list?.category_order || []), ...groups.map(g => g.label), ...CATEGORIES])]);
  }
  const snapshot = () => `${list?.name || tr("module.shopping.visual.einkauf")}\n\n${groupShoppingItems(open, list?.category_order).map(g => `${g.label}\n${g.items.map(i => `☐ ${i.name} · ${i.spec || '1'}${i.notes ? ' · ' + i.notes : ''}${i.priority === 'urgent' ? ' · Dringend' : ''}`).join('\n')}`).join('\n\n')}`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([snapshot()], {
      type: 'text/plain;charset=utf-8'
    }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(list?.name || tr("module.shopping.visual.einkauf")).replace(/[^\p{L}\p{N} _-]/gu, '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const copy = () => run(async () => {
    await navigator.clipboard.writeText(snapshot());
    toast.success(tr("module.shopping.visual.liste_kopiert"));
  }, () => {});
  const chooseRecipe = recipe => show('recipe', {
    recipe,
    selected: (recipe.ingredients || []).filter(i => !open.some(p => fold(p.name) === fold(i.name))).map(i => i.name),
    list_id: sh.activeListId
  });
  return <div className={`shopping-page dashboard-today-page shop-page ${trip ? 'shopping-trip' : ''}`}>
 {!trip && <div className="shop-command-header"><button className="shop-navigation" aria-label={tr("module.shopping.visual.navigation_offnen")} onClick={props.onOpenNavigation}><Menu size={19} /></button><CalendarTopbar {...props} /></div>}
 {trip && <div className="shop-trip-banner"><div className="shop-trip-copy"><span className="badge-icon"><ShoppingCart size={21} /></span><div><strong>{tr("module.shopping.visual.einkaufsmodus")}</strong><small>{list?.name} · {open.length ? tr("module.shopping.visual.0_artikel_fehlen_noch", [open.length]) : tr("module.shopping.visual.alles_im_korb")}</small></div></div><button className="btn soft" onClick={() => setTrip(false)}><X className="icon sm" />{tr("module.shopping.visual.beenden")}</button></div>}
 <header className="shop-header"><div><div className="shop-kicker">{tr("module.shopping.visual.einkauf_euer_familienalltag")}</div><h1>{tr("module.shopping.visual.fur_alles_was_euch_fehlt")}</h1><p>{tr("module.shopping.visual.eine_liste_alle_lieblingsdinge_gemeinsam_dran_denken")}</p></div><button className="shop-people" aria-label={tr("module.shopping.visual.familienliste_und_speicherinformationen")} onClick={() => show('members')}><span className="avatar-stack">{members.slice(0, 3).map((member, index) => <MemberAvatar key={member.id || member.user_id} member={member} index={index} size={28} />)}</span><span className="shop-people-copy">{tr("module.shopping.visual.eure_familienliste")}<small><ShieldCheck className="icon xs" />{demoMode ? tr("module.shopping.visual.demo_modus") : sh.wsConnected ? tr("module.shopping.visual.live_verbunden") : tr("module.shopping.visual.fur_eure_familie")}</small></span></button></header>
 <nav className="shop-listbar" aria-label={tr("module.shopping.visual.einkaufslisten")}>{sh.shoppingLists.map(l => <button key={l.id} className={`shop-list-tab ${l.id === sh.activeListId ? 'active' : ''}`} aria-pressed={l.id === sh.activeListId} onClick={() => sh.setActiveListId(l.id)}><ListIcon name={l.icon} />{l.name}<span className="shop-list-count">{l.id === sh.activeListId ? open.length : Math.max(0, (l.item_count || 0) - (l.checked_count || 0))}</span></button>)}{!isChild && <button className="shop-list-new" aria-label={tr("module.shopping.visual.neue_einkaufsliste")} onClick={() => {
        sh.setNewListName('');
        show('new-list');
      }}><Plus className="icon sm" />{tr("module.shopping.visual.neue_liste")}</button>}<div className="shop-list-extra"><button className="btn small shop-copy-button" disabled={!list} onClick={() => show('share')}><Upload className="icon sm" />{tr("module.shopping.visual.liste_weitergeben")}</button><button className="btn small shop-mode-button" disabled={!list} onClick={() => setTrip(true)}><ShoppingCart className="icon sm" />{tr("module.shopping.visual.einkaufen")}</button><button className="icon-button bare" disabled={!list} aria-label={tr("module.shopping.visual.listenoptionen")} onClick={() => show('list-menu')}><MoreVertical className="icon sm" /></button></div></nav>
 {!isChild && <div className="shop-addbar"><form className="shop-add-form" onSubmit={e => {
        e.preventDefault();
        add(parsed, true);
      }}><Search className="icon sm" /><input ref={sh.itemInputRef} value={query} maxLength={180} disabled={!list || busy} onChange={e => {
          setQuery(e.target.value);
          setSuggestion(-1);
          setFocused(true);
        }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={e => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSuggestion(i => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSuggestion(i => Math.max(0, i - 1));
          } else if (e.key === 'Escape') {
            setFocused(false);
            setSuggestion(-1);
          } else if (e.key === 'Enter' && suggestion >= 0 && suggestions[suggestion]) {
            e.preventDefault();
            add({
              ...suggestions[suggestion],
              ...(parsed.explicit ? {
                spec: parsed.spec
              } : {})
            }, true);
          }
        }} placeholder={tr("module.shopping.visual.was_fehlt_noch_zum_beispiel_2_kg_apfel")} autoComplete="off" role="combobox" aria-label={tr("module.shopping.visual.artikel_suchen_oder_mit_menge_hinzufugen")} aria-expanded={focused && suggestions.length > 0} aria-controls="shop-search-results" aria-autocomplete="list" aria-activedescendant={focused && suggestion >= 0 ? `shop-suggestion-${suggestion}` : undefined} /><span className="shop-enter" aria-hidden="true">↵</span><button className="btn primary" type="submit" aria-label={tr("module.shopping.visual.artikel_hinzufugen")} disabled={!list || busy}><Plus className="icon sm" /><span className="shop-add-word">{tr("module.shopping.visual.hinzufugen_45")}</span></button></form>
 {focused && suggestions.length > 0 && <div className="shop-autocomplete" id="shop-search-results" role="listbox" aria-label={tr("module.shopping.visual.artikelvorschlage")}>{suggestions.map((p, i) => <button key={p.id} id={`shop-suggestion-${i}`} className="shop-search-result" role="option" aria-selected={suggestion === i} onMouseDown={e => e.preventDefault()} onClick={() => add({
          ...p,
          ...(parsed.explicit ? {
            spec: parsed.spec
          } : {})
        }, true)}><GroceryArt name={p.name} art={p.art} /><span className="grow">{p.name}<small>{p.category}</small></span><Plus size={15} /></button>)}</div>}</div>}
 {error && !modal && <p className="shop-error" role="alert">{error}</p>}
 <div className="shop-layout"><div className="shop-main"><section className="panel shop-board"><div className="shop-board-head"><div className="shop-board-name"><ListIcon name={list?.icon} /><h3>{list?.name || tr("module.shopping.visual.eure_einkaufslisten")}</h3></div><div className="shop-board-tools">{!isChild && <button className="shop-sort shop-catalog-mobile" aria-label={tr("module.shopping.visual.artikelkatalog_offnen")} onClick={() => show('catalog')}><Plus className="icon sm" /></button>}{!isChild && <button className="shop-sort" aria-label={tr("module.shopping.visual.reihenfolge_der_kategorien_andern")} disabled={!list} onClick={openSort}><SlidersHorizontal className="icon sm" /><span>{tr("module.shopping.visual.sortieren")}</span></button>}<div className="shop-view-toggle" role="group" aria-label={tr("module.shopping.visual.darstellung")}><button className={prefs.layout === 'tiles' ? 'active' : ''} aria-label={tr("module.shopping.visual.kachelansicht")} aria-pressed={prefs.layout === 'tiles'} onClick={() => preference({
                  layout: 'tiles'
                })}><Grid2X2 className="icon sm" /></button><button className={prefs.layout === 'list' ? 'active' : ''} aria-label={tr("module.shopping.visual.listenansicht")} aria-pressed={prefs.layout === 'list'} onClick={() => preference({
                  layout: 'list'
                })}><List className="icon sm" /></button></div></div></div>
 <div className="shop-board-status"><span className="shop-open-count"><span className="shop-open-dot" /><strong>{open.length}</strong> {tr("module.shopping.visual.noch_besorgen")}</span>{open.some(i => i.priority === 'urgent') && <button className={`shop-priority-filter ${urgent ? 'active' : ''}`} aria-pressed={urgent} onClick={() => setUrgent(!urgent)}>{tr("module.shopping.visual.dringend")} {open.filter(i => i.priority === 'urgent').length}</button>}<span className="shop-board-progress"><span className="shop-progress-track" role="progressbar" aria-label={tr("module.shopping.visual.einkaufsfortschritt")} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{
                  width: `${pct}%`
                }} /></span>{done.length} {tr("module.shopping.visual.von")} {open.length + done.length} {tr("module.shopping.visual.im_korb")}</span></div>
 {groups.length ? <div className="shop-sections">{groups.map(group => <section key={group.key} className={`shop-section ${group.items.length <= 2 && prefs.layout === 'tiles' ? 'shop-section-half' : ''}`} aria-label={group.label}><h4 className="shop-category-title"><GroceryArt name={group.items[0].name} />{group.label}<span className="category-count">{group.items.length}</span></h4>{tiles(group.items)}</section>)}</div> : <div className="shop-empty"><ShoppingCart className="icon" /><h4>{!list ? tr("module.shopping.visual.platz_fur_eure_einkaufslisten") : urgent ? tr("module.shopping.visual.nichts_dringendes_mehr") : done.length ? tr("module.shopping.visual.alles_im_korb_gut_gemacht") : tr("module.shopping.visual.platz_fur_eure_lieblingsdinge")}</h4><p>{list ? tr("module.shopping.visual.fugt_artikel_uber_die_suche_hinzu_oder_tippt_im_katalog") : tr("module.shopping.visual.legt_eure_erste_liste_an_und_sammelt_gemeinsam_was_fehl")}</p>{!isChild && <button className="btn small soft" onClick={() => urgent ? setUrgent(false) : show(list ? 'catalog' : 'new-list')}><Plus className="icon sm" />{urgent ? tr("module.shopping.visual.alle_artikel_anzeigen") : list ? tr("module.shopping.visual.artikel_auswahlen") : tr("module.shopping.visual.neue_liste")}</button>}</div>}
 {done.length > 0 && <details className="shop-done" open={prefs.doneOpen} onToggle={e => {
            if (e.currentTarget.open !== prefs.doneOpen) preference({
              doneOpen: e.currentTarget.open
            });
          }}><summary><CheckCircle className="icon sm" /><strong>{tr("module.shopping.visual.schon_im_korb")}</strong><span>· {done.length}</span><ChevronDown className="icon sm" /></summary>{tiles(done)}<div className="shop-done-info"><span>{tr("module.shopping.visual.ein_tipp_setzt_einen_artikel_wieder_auf_die_liste")}</span>{!isChild && <button onClick={() => show('complete')}>{tr("module.shopping.visual.einkauf_abschlie_en")}</button>}</div></details>}
 {sh.undo && <div className="shop-undo" role="status">{sh.undo.name || tr("module.shopping.visual.artikel")} {sh.undo.checked ? tr("module.shopping.visual.im_korb_70") : tr("module.shopping.visual.wieder_auf_der_liste")}<button onClick={sh.undoToggle}>{tr("module.shopping.visual.ruckgangig")}</button></div>}
 <div className="shop-board-hint"><Info className="icon xs" />{tr("module.shopping.visual.kachel_antippen_zum_abhaken_details_uber_die_drei_punkt")}</div></section></div>
 {!isChild && <aside className="shop-rail" aria-label={tr("module.shopping.visual.artikelkatalog_und_essensplan")}><section className="panel shop-catalog-panel"><div className="shop-catalog-heading"><Plus className="icon sm" /><h3>{tr("module.shopping.visual.schnell_hinzufugen")}</h3></div><p className="shop-catalog-intro">{tr("module.shopping.visual.ein_tipp_schon_auf_eurer_liste")}</p>{discovery()}</section>
 <section className="panel shop-recipe-card"><div className="eyebrow">{selectedRecipe ? tr("module.shopping.visual.aus_eurem_essensplan") : tr("module.shopping.visual.aus_euren_rezepten")}</div>{selectedRecipe ? <><div className="shop-recipe-content">{/nudel|pasta/i.test(selectedRecipe.title) ? <img className="meal-photo" src="/illustrations/meal-lunch.jpg" alt="" /> : <span className="shop-recipe-art"><BookOpen size={28} /></span>}<div><h3>{selectedRecipe.title}</h3><p>{selectedRecipe.servings} {tr("module.shopping.visual.portionen")}</p></div></div><button className="btn" onClick={() => chooseRecipe(selectedRecipe)}><BookOpen className="icon sm" />{tr("module.shopping.visual.zutaten_auswahlen")}<ArrowRight className="icon xs" /></button></> : <><p>{tr("module.shopping.visual.was_kommt_bei_euch_auf_den_tisch")}</p><button className="btn" onClick={() => recipes.length ? show('recipes') : setActiveView('recipes')}><BookOpen className="icon sm" />{tr("module.shopping.visual.rezepte_auswahlen")}<ArrowRight className="icon xs" /></button></>}</section>
 <div className="shop-quiet-note"><Heart className="icon sm" /><p>{tr("module.shopping.visual.die_richtige_milch_das_lieblingsbrot")}<br />{tr("module.shopping.visual.ein_kleines_detail_erspart_die_ruckfrage")}</p></div></aside>}</div>
 <footer className="shop-local-footnote"><ShieldCheck className="icon xs" />{demoMode ? tr("module.shopping.visual.demo_modus_anderungen_werden_nicht_gespeichert") : sh.wsConnected ? tr("module.shopping.visual.fur_eure_familie_gespeichert_anderungen_werden_live_syn") : tr("module.shopping.visual.fur_eure_familie_gespeichert_live_verbindung_wird_herge")}<button onClick={() => show('info')}>{tr("module.shopping.visual.so_funktioniert_die_neue_einkaufsliste")}</button></footer>
 <div className="shop-mobile-dock"><span className="shop-dock-count"><ShoppingCart className="icon sm" /><strong>{open.length}</strong> {tr("module.shopping.visual.offen")}</span>{!isChild && <button className="btn" onClick={() => show('catalog')}><Plus className="icon sm" />{tr("module.shopping.visual.katalog")}</button>}<button className="btn shop-mode-button" disabled={!list} onClick={() => setTrip(true)}>{tr("module.shopping.visual.einkaufen")}<ArrowRight className="icon sm" /></button><button className="shop-dock-more" aria-label={tr("module.shopping.visual.listenoptionen")} disabled={!list} onClick={() => show('list-menu')}><MoreVertical className="icon sm" /></button></div>
 {modal === 'product' && <ProductEditor item={draft} lists={sh.shoppingLists} activeListId={sh.activeListId} categories={sh.categories || []} onClose={close} favorites={prefs.favorites} onStoreSearch={stores.length ? () => {
      setStoreItem(draft);
      close();
    } : undefined} onFavorite={favorite} onSave={payload => draft.id ? sh.editItem(draft.id, payload) : sh.addProduct(payload)} onDelete={() => show('delete-item', draft)} />}
 {modal && modal !== 'product' && <ShoppingDialog title={{
      catalog: tr("module.shopping.visual.schnell_hinzufugen"),
      share: tr("module.shopping.visual.liste_weitergeben"),
      sort: tr("module.shopping.visual.so_geht_ihr_durch_den_laden"),
      'new-list': tr("module.shopping.visual.eine_neue_einkaufsliste"),
      'edit-list': tr("module.shopping.visual.eure_liste_euer_name"),
      'list-menu': list?.name || tr("module.shopping.visual.listenoptionen"),
      complete: tr("module.shopping.visual.einkauf_abschlie_en_93"),
      'delete-list': tr("module.shopping.visual.liste_loschen"),
      'delete-item': tr("module.shopping.visual.artikel_loschen"),
      members: tr("module.shopping.visual.eure_familienliste"),
      info: tr("module.shopping.visual.gemeinsam_an_alles_denken"),
      templates: tr("module.shopping.visual.eure_einkaufsvorlagen"),
      'template-edit': tr("module.shopping.visual.einkaufsvorlage"),
      recipes: tr("module.shopping.visual.aus_euren_rezepten"),
      recipe: tr("module.shopping.visual.was_fehlt_fur_dieses_rezept")
    }[modal]} onClose={close} wide={modal === 'template-edit'}>
 {modal === 'catalog' && <div className="shop-bottom-sheet">{discovery()}</div>}
 {modal === 'share' && <><p>{tr("module.shopping.visual.eine_text_momentaufnahme_eurer_offenen_artikel_die_geme")}</p><textarea className="shop-share-text" readOnly value={snapshot()} aria-label={tr("module.shopping.visual.einkaufsliste_als_text")} /><div className="shop-modal-actions"><button className="btn" onClick={download}><Download size={15} />{tr("module.shopping.visual.textdatei")}</button><button className="btn primary" onClick={copy}><Copy size={15} />{tr("module.shopping.visual.kopieren")}</button></div></>}
 {modal === 'members' && <><p>{demoMode ? tr("module.shopping.visual.ihr_entdeckt_gerade_die_demo") : tr("module.shopping.visual.alle_mitglieder_eurer_familie_sehen_diese_liste_anderun")}</p><div className="shop-members">{members.map((m, i) => <div key={m.id || m.user_id}><MemberAvatar member={m} index={i} size={32} />{m.display_name}</div>)}</div></>}
 {modal === 'info' && <div className="shop-help"><p>{tr("module.shopping.visual.ein_tipp_legt_einen_artikel_in_den_korb_ein_weiterer_ho")}</p><p>{tr("module.shopping.visual.uber_die_drei_punkte_oder_langes_drucken_offnet_ihr_men")}</p><p>{tr("module.shopping.visual.die_abteilungsreihenfolge_wird_pro_liste_gespeichert_li")}</p></div>}
 {modal === 'list-menu' && <div className="shop-menu">{!isChild && <><button onClick={() => show('edit-list', {
            name: list.name,
            icon: list.icon || 'cart'
          })}>{tr("module.shopping.visual.liste_bearbeiten")}</button><button onClick={openSort}>{tr("module.shopping.visual.abteilungsreihenfolge")}</button><button onClick={() => show('templates')}>{tr("module.shopping.visual.einkaufsvorlagen")}</button><button onClick={() => recipes.length ? show('recipes') : setActiveView('recipes')}>{tr("module.shopping.visual.zutaten_aus_rezepten")}</button><button disabled={!done.length} onClick={() => show('complete')}>{tr("module.shopping.visual.einkauf_abschlie_en")}</button></>}<button onClick={() => show('share')}>{tr("module.shopping.visual.liste_weitergeben")}</button>{!isChild && <button className="shop-danger" onClick={() => show('delete-list')}>{tr("module.shopping.visual.liste_loschen_113")}</button>}</div>}
 {(modal === 'new-list' || modal === 'edit-list') && <form className="shop-fields" onSubmit={e => {
        e.preventDefault();
        run(() => modal === 'new-list' ? sh.createList(e) : sh.updateListDetails(draft));
      }}><label className="field full">{tr("module.shopping.visual.listenname")}<input autoFocus required maxLength={100} value={modal === 'new-list' ? sh.newListName : draft.name} onChange={e => modal === 'new-list' ? sh.setNewListName(e.target.value) : setDraft({
            ...draft,
            name: e.target.value
          })} /></label>{modal === 'edit-list' && <div className="shop-list-icons full">{Object.keys(ICONS).map(icon => <button key={icon} type="button" className={`btn ${draft.icon === icon ? 'soft' : ''}`} aria-label={icon} aria-pressed={draft.icon === icon} onClick={() => setDraft({
            ...draft,
            icon
          })}><ListIcon name={icon} /></button>)}</div>}<button className="btn primary" disabled={busy}>{tr("module.shopping.visual.speichern")}</button></form>}
 {modal === 'sort' && <><p>{tr("module.shopping.visual.ordnet_die_abteilungen_passend_zu_eurem_supermarkt_leer")}</p><div className="shop-sort-list">{draft.map((c, index) => <div className="shop-sort-row" key={c}><span className="grow">{c}</span>{[-1, 1].map(direction => <button key={direction} className="btn small" disabled={index + direction < 0 || index + direction >= draft.length} aria-label={tr("module.shopping.visual.0_nach_1", [c, direction < 0 ? tr("module.shopping.visual.oben") : tr("module.shopping.visual.unten")])} onClick={() => {
              const next = [...draft];
              [next[index], next[index + direction]] = [next[index + direction], next[index]];
              setDraft(next);
            }}>{direction < 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button>)}</div>)}</div><button className="btn primary" disabled={busy} onClick={() => run(() => sh.updateListDetails({
          category_order: draft
        }))}>{tr("module.shopping.visual.reihenfolge_speichern")}</button></>}
 {['complete', 'delete-list', 'delete-item'].includes(modal) && <><p>{modal === 'complete' ? tr("module.shopping.visual.0_gekaufte_artikel_werden_aus_1_entfernt_unter_zuletzt_", [done.length, list.name]) : modal === 'delete-list' ? tr("module.shopping.visual.0_und_alle_zugehorigen_artikel_endgultig_loschen", [list.name]) : tr("module.shopping.visual.0_endgultig_loschen", [draft.name])}</p><div className="shop-modal-actions"><button className="btn" onClick={close}>{tr("module.shopping.visual.abbrechen")}</button><button className={`btn ${modal === 'complete' ? 'primary' : 'danger'}`} disabled={busy} onClick={() => run(() => modal === 'complete' ? sh.completeTrip() : modal === 'delete-list' ? sh.deleteList(list.id) : sh.deleteItem(draft.id))}>{modal === 'complete' ? tr("module.shopping.visual.einkauf_abschlie_en") : tr("module.shopping.visual.loschen")}</button></div></>}
 {modal === 'templates' && <><button className="btn" onClick={() => show('template-edit', null)}><Plus size={15} />{tr("module.shopping.visual.neue_vorlage")}</button>{(sh.templates || []).map(template => <ShoppingTemplateCard key={template.id} template={template} messages={messages} onApply={() => run(() => sh.applyTemplate(template.id))} onEdit={t => show('template-edit', t)} onDelete={() => run(() => sh.deleteTemplate(template.id), () => {})} />)}</>}
 {modal === 'template-edit' && <ShoppingTemplateForm messages={messages} initialTemplate={draft} onCancel={() => show('templates')} onSubmit={payload => run(() => draft ? sh.updateTemplate(draft.id, payload) : sh.createTemplate(payload), () => show('templates'))} />}
 {modal === 'recipes' && <div className="shop-menu">{recipes.map(recipe => <button key={recipe.id} onClick={() => chooseRecipe(recipe)}>{recipe.title}<ArrowRight size={15} /></button>)}</div>}
 {modal === 'recipe' && <><h3>{draft.recipe.title}</h3><p>{tr("module.shopping.visual.bereits_notierte_zutaten_sind_abgewahlt_entfernt_zusatz")}</p><div className="shop-ingredients">{(draft.recipe.ingredients || []).map((ingredient, index) => <label key={index}><input type="checkbox" checked={draft.selected.includes(ingredient.name)} onChange={e => setDraft({
              ...draft,
              selected: e.target.checked ? [...draft.selected, ingredient.name] : draft.selected.filter(name => name !== ingredient.name)
            })} /><span>{ingredient.name}</span><small>{ingredient.amount} {ingredient.unit}</small></label>)}</div><button className="btn primary" disabled={busy || !draft.selected.length || !list} onClick={() => run(async () => {
          const response = await api.apiAddRecipeIngredientsToShopping(draft.recipe.id, draft.list_id, draft.selected);
          if (!response.ok) return false;
          await sh.reloadItems();
          return true;
        })}>{tr("module.shopping.visual.ausgewahlte_zutaten_hinzufugen")}</button></>}
 {error && <p className="shop-error" role="alert">{error}</p>}
 </ShoppingDialog>}
 {storeItem && <StoreSearchMenu item={storeItem} stores={stores} messages={messages} onClose={() => setStoreItem(null)} />}
 </div>;
}
