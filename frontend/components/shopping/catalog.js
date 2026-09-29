import { SHOP_CATALOG, GROCERY_ART } from '../../lib/shoppingCatalog';
export const CATEGORIES = ['Obst & Gemüse','Kühlregal','Bäckerei','Vorrat','Getränke','Fleisch & Fisch','Tiefkühl','Haushalt','Sonstiges'];
export const fold = value => String(value || '').toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').trim();
// Built-in categories keep these labels as their stored value; every client
// shows them in its own language (#512). The server folds any translation back.
export const CATEGORY_KEYS = ['produce','chilled','bakery','pantry','drinks','meat','frozen','household','other'];
const ENGLISH_CATEGORIES = ['Fruit & vegetables','Chilled','Bakery','Pantry','Drinks','Meat & fish','Frozen','Household','Other'];
const BUILTIN_BY_LABEL = new Map([...CATEGORIES, ...ENGLISH_CATEGORIES].map((label, index) => [fold(label), CATEGORY_KEYS[index % CATEGORY_KEYS.length]]));
export function builtinCategory(label) { return BUILTIN_BY_LABEL.get(fold(label)) || null; }
export function categoryLabel(label, tr) { const key = builtinCategory(label); return key ? tr(`module.shopping.category.${key}`) : label; }
// Catalogue products are named in German for German readers and in English
// otherwise, like the app (#562); typed text matches either language.
const germanReader = lang => String(lang || 'de').toLowerCase().startsWith('de');
function localProduct(product, lang) {
  const de = germanReader(lang);
  return { ...product, name: de ? product.nameDe : product.nameEn, unit: de ? product.unitDe : product.unitEn, aliases: [product.nameDe, product.nameEn, product.aliases].join(' ') };
}
function findProduct(name) { const q = fold(name); return q ? SHOP_CATALOG.find(p => fold(p.nameDe) === q || fold(p.nameEn) === q || p.aliases.split(' ').some(a => a && fold(a) === q)) : undefined; }
export function catalogFor(lang) { return SHOP_CATALOG.map(p => localProduct(p, lang)); }
export function catalogProduct(name, lang = 'de') { const product = findProduct(name); return product ? localProduct(product, lang) : undefined; }
// The same key for a product in either language ("Milch", "Milk"), for
// favourites and "already on the list"; the German name keeps saved favourites.
export function productKey(name) { const product = findProduct(name); return product ? fold(product.nameDe) : fold(name); }
export function shopUnits(lang) { return germanReader(lang) ? ['Stück', 'g', 'kg', 'ml', 'l', 'Packung', 'Dose', 'Flaschen', 'EL', 'TL'] : ['g', 'kg', 'ml', 'l', 'pack', 'can', 'bottles', 'jar', 'tbsp', 'tsp']; }
export function GroceryArt({name, art, className=''}) {
  const key = art && GROCERY_ART[art] ? art : catalogProduct(name)?.art || 'bag';
  // Only the bundled, user-supplied SVG paths enter this markup; never product input.
  return <svg className={`grocery-art ${className}`} viewBox="0 0 64 64" aria-hidden="true" dangerouslySetInnerHTML={{__html:GROCERY_ART[key]}}/>;
}
export function parseProduct(text, lang = 'de') {
  let name = text.trim().replace(/\s+/g,' '), qty=1, unit='', explicit=false;
  const match = name.match(/^(\d+\/\d+|\d+(?:[.,]\d+)?|½|¼|¾)\s*(kg|g|ml|l|Liter|Gramm|Kilogramm|Milliliter|Stück|Stk\.?|St\.?|Packungen?|Dosen?|Flaschen?|Tuben?|EL|TL|Esslöffel|Teelöffel|Gläser|Glas|Tafeln?|Bund|Topf|pcs|packs?|cans?|bottles?|jars?|bars?|tubes?|pots?|tbsp|tsp)?\s+(.+)$/i);
  if (match) {
    const n=match[1]; qty=({'½':.5,'¼':.25,'¾':.75})[n] ?? (n.includes('/') ? Number(n.split('/')[0])/Number(n.split('/')[1]) : Number(n.replace(',','.')));
    unit=({liter:'l',gramm:'g',kilogramm:'kg',milliliter:'ml',stk:'Stück',st:'Stück'})[fold(match[2]).replace(/\.$/,'')] || match[2] || '';
    if (!Number.isFinite(qty) || qty < .001 || qty > 99999) return {name:match[3],spec:"",category:"Sonstiges",explicit:true,invalid:true};
    name=match[3];explicit=true;
  }
  const product=catalogProduct(name, lang);
  return {name:product?.name || name, spec:explicit ? `${qty}${unit ? ' '+unit : ''}` : `${product?.qty || 1}${product?.unit ? ' '+product.unit : ''}`,category:product?.category || 'Sonstiges',explicit};
}
export function splitSpec(spec) {
  const match=String(spec || '').match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  return match ? {qty:match[1].replace(',','.'),unit:match[2],legacy:''} : {qty:1,unit:'',legacy:spec || ''};
}
export function groupShoppingItems(items, order=[]) {
  const groups = new Map();
  for (const item of items) { const label=item.category || catalogProduct(item.name)?.category || 'Sonstiges';const key=fold(label); if(!groups.has(key))groups.set(key,{key,label,items:[]});groups.get(key).items.push(item); }
  const allOrder=[...order,...CATEGORIES].map(fold);
  return [...groups.values()].sort((a,b)=>(allOrder.includes(a.key)?allOrder.indexOf(a.key):999)-(allOrder.includes(b.key)?allOrder.indexOf(b.key):999));
}
export {SHOP_CATALOG};
