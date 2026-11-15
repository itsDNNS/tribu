import { useShoppingText } from "./useShoppingText";
import { ShoppingCart, X } from 'lucide-react';
import ModalDialog from '../ModalDialog';
export default function ShoppingDialog({
  title,
  children,
  onClose,
  actions,
  wide = false
}) {
  const tr = useShoppingText();
  return <ModalDialog className={`shop-dialog ${wide ? 'wide' : ''}`} onClose={onClose} aria-label={title}>
 <header className="shop-modal-header"><span className="badge-icon"><ShoppingCart size={21} /></span><div><h2>{title}</h2><p>{tr("module.shopping.visual.tribu_gemeinsam_den_alltag_leichter_machen")}</p></div><button className="icon-button bare" aria-label={tr("module.shopping.visual.schlie_en")} onClick={onClose}><X size={17} /></button></header><div className="shop-modal-body">{children}</div>{actions && <footer className="shop-modal-actions">{actions}</footer>}</ModalDialog>;
}
