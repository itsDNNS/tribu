import { useShoppingText } from "./useShoppingText";
import { useEffect, useRef } from 'react';
import { Check, MoreVertical } from 'lucide-react';
import { GroceryArt } from './catalog';
export default function ProductTile({
  item,
  onToggle,
  onEdit,
  pending
}) {
  const tr = useShoppingText();
  const timer = useRef(null),
    start = useRef(null),
    suppressed = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  return <article className={`shop-tile ${item.checked ? 'done ' : ''}${item.priority === 'urgent' && !item.checked ? 'urgent' : ''}`}>
 <button className="shop-tile-main" role="checkbox" aria-checked={item.checked} aria-label={`${item.name}, ${item.spec || '1'}. ${item.checked ? tr("module.shopping.visual.wieder_auf_die_liste_setzen") : tr("module.shopping.visual.als_eingekauft_markieren")}`} disabled={pending} onPointerDown={e => {
      if (e.button !== 0) return;
      cancel();
      suppressed.current = false;
      start.current = {
        x: e.clientX,
        y: e.clientY
      };
      timer.current = setTimeout(() => {
        suppressed.current = true;
        onEdit?.(item);
      }, 550);
    }} onPointerMove={e => {
      if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    }} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onContextMenu={e => {
      if (onEdit) {
        e.preventDefault();
        cancel();
        suppressed.current = true;
        onEdit(item);
      }
    }} onClick={() => {
      cancel();
      if (suppressed.current) {
        suppressed.current = false;
        return;
      }
      document.activeElement?.blur();
      onToggle(item.id, item.checked);
    }}>
 <span className="shop-tile-check">{item.checked && <Check size={12} />}</span>{item.photo ? <img className="shop-product-photo" src={item.photo} alt="" /> : <GroceryArt name={item.name} />}
 <span className="shop-product-copy"><span className="shop-product-name">{item.name}</span><span className="shop-product-qty">{item.spec || tr("module.shopping.visual.1_stuck")}</span><span className="shop-product-note">{item.notes || ''}</span></span></button>
 {item.priority === 'urgent' && !item.checked && <span className="shop-urgent">{tr("module.shopping.visual.dringend")}</span>}{onEdit && <button className="shop-tile-menu" aria-label={tr("module.shopping.visual.details_zu_0", [item.name])} onClick={() => onEdit(item)}><MoreVertical size={17} /></button>}</article>;
}
