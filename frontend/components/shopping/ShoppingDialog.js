import { useShoppingText } from "./useShoppingText";
import { useEffect, useRef } from 'react';
import { ShoppingCart, X } from 'lucide-react';
export default function ShoppingDialog({
  title,
  children,
  onClose,
  actions,
  wide = false
}) {
  const tr = useShoppingText();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return <dialog ref={ref} className={`shop-dialog ${wide ? 'wide' : ''}`} onCancel={e => {
    e.preventDefault();
    onClose();
  }} onClick={e => {
    if (e.target === e.currentTarget) {
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
    }
  }} aria-label={title}>
 <header className="shop-modal-header"><span className="badge-icon"><ShoppingCart size={21} /></span><div><h2>{title}</h2><p>{tr("module.shopping.visual.tribu_gemeinsam_den_alltag_leichter_machen")}</p></div><button className="icon-button bare" aria-label={tr("module.shopping.visual.schlie_en")} onClick={onClose}><X size={17} /></button></header><div className="shop-modal-body">{children}</div>{actions && <footer className="shop-modal-actions">{actions}</footer>}</dialog>;
}
