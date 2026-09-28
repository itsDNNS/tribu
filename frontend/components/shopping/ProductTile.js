import { useShoppingText } from "./useShoppingText";
import { useEffect, useRef } from 'react';
import { Check, CloudOff, MoreVertical, Trash2, Undo2 } from 'lucide-react';
import { GroceryArt } from './catalog';
import { useSwipeActions } from '../../hooks/useSwipeActions';
import SwipeReveal, { swipeStyle } from '../SwipeReveal';

// One product. As a row (`swipe`) it also swipes: right into the basket or
// back, left to delete.
export default function ProductTile({
  item,
  onToggle,
  onEdit,
  onRemove,
  pending,
  waiting = false,
  swipe = false
}) {
  const tr = useShoppingText();
  const { offset, handlers } = useSwipeActions({
    enabled: swipe,
    onSwipeRight: pending ? undefined : () => onToggle(item.id, item.checked),
    onSwipeLeft: onRemove && !pending ? () => onRemove(item) : undefined
  });
  const timer = useRef(null),
    start = useRef(null),
    suppressed = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);
  const body = <>
 <button className="shop-tile-main" role="checkbox" aria-checked={item.checked} aria-label={`${item.name}, ${item.spec || '1'}. ${waiting ? `${tr('offline.waiting')}. ` : ''}${item.checked ? tr("module.shopping.visual.wieder_auf_die_liste_setzen") : tr("module.shopping.visual.als_eingekauft_markieren")}`} disabled={pending} onPointerDown={e => {
      if (e.button !== 0 || !onEdit) return;
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
 <span className="shop-product-copy"><span className="shop-product-name">{item.name}</span><span className="shop-product-qty">{item.spec || tr("module.shopping.visual.1_stuck")}</span>{waiting ? <span className="shop-product-note shop-waiting"><CloudOff size={11} aria-hidden="true" />{tr('offline.waiting')}</span> : <span className="shop-product-note">{item.notes || ''}</span>}</span></button>
 {item.priority === 'urgent' && !item.checked && <span className="shop-urgent">{tr("module.shopping.visual.dringend")}</span>}{onEdit && <button className="shop-tile-menu" aria-label={tr("module.shopping.visual.details_zu_0", [item.name])} onClick={() => onEdit(item)}><MoreVertical size={17} /></button>}</>;
  const className = `shop-tile ${item.checked ? 'done ' : ''}${item.priority === 'urgent' && !item.checked ? 'urgent' : ''}`;
  if (!swipe) return <article className={className}>{body}</article>;
  return <article className={`${className} swipe-shell`} {...handlers}>
 <SwipeReveal offset={offset} right={pending ? null : {
      icon: item.checked ? <Undo2 size={18} /> : <Check size={18} />,
      label: tr(item.checked ? 'module.shopping.swipe_back' : 'module.shopping.swipe_basket'),
      tone: 'success'
    }} left={onRemove && !pending ? {
      icon: <Trash2 size={18} />,
      label: tr('module.shopping.visual.loschen'),
      tone: 'danger'
    } : null} />
 <div className="swipe-slide" style={swipeStyle(offset)}>{body}</div></article>;
}
