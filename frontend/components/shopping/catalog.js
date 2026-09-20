import { SHOP_CATALOG, GROCERY_ART } from '../../lib/shoppingCatalog';
export const CATEGORIES = ['Obst & Gemüse','Kühlregal','Bäckerei','Vorrat','Getränke','Fleisch & Fisch','Tiefkühl','Haushalt','Sonstiges'];
export const fold = value => String(value || '').toLocaleLowerCase('de').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').trim();
export function catalogProduct(name) { const q = fold(name); return SHOP_CATALOG.find(p => fold(p.name) === q || p.aliases.split(' ').some(a => a && fold(a) === q)); }
export function GroceryArt({name, art, className=''}) {
  const key = art && GROCERY_ART[art] ? art : catalogProduct(name)?.art || 'bag';
  // Only the bundled, user-supplied SVG paths enter this markup; never product input.
  return <svg className={`grocery-art ${className}`} viewBox="0 0 64 64" aria-hidden="true" dangerouslySetInnerHTML={{__html:GROCERY_ART[key]}}/>;
}
export function parseProduct(text) {
  let name = text.trim().replace(/\s+/g,' '), qty=1, unit='', explicit=false;
  const match = name.match(/^(\d+\/\d+|\d+(?:[.,]\d+)?|½|¼|¾)\s*(kg|g|ml|l|Liter|Gramm|Kilogramm|Milliliter|Stück|Stk\.?|St\.?|Packungen?|Dosen?|Flaschen?|Tuben?|EL|TL|Esslöffel|Teelöffel|Gläser|Glas|Tafeln?|Bund|Topf)?\s+(.+)$/i);
  if (match) {
    const n=match[1]; qty=({'½':.5,'¼':.25,'¾':.75})[n] ?? (n.includes('/') ? Number(n.split('/')[0])/Number(n.split('/')[1]) : Number(n.replace(',','.')));
    unit=({liter:'l',gramm:'g',kilogramm:'kg',milliliter:'ml',stk:'Stück',st:'Stück'})[fold(match[2]).replace(/\.$/,'')] || match[2] || '';
    if (!Number.isFinite(qty) || qty < .001 || qty > 99999) return {name:match[3],spec:"",category:"Sonstiges",explicit:true,invalid:true};
    name=match[3];explicit=true;
  }
  const product=catalogProduct(name);
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
