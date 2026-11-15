import { createContext, useCallback, useContext, useMemo, useState } from 'react';

// Open modal dialogs, innermost last. A modal makes the rest of the page inert,
// so whatever must stay usable meanwhile (the toasts) renders inside the innermost one.
const ModalStackContext = createContext(null);

export function ModalStackProvider({ children }) {
  const [modals, setModals] = useState([]);
  const openModal = useCallback((id) => {
    setModals((current) => [...current, id]);
    return () => setModals((current) => current.filter((entry) => entry !== id));
  }, []);
  const value = useMemo(() => ({ openModal, topModal: modals.at(-1) ?? null }), [openModal, modals]);
  return <ModalStackContext.Provider value={value}>{children}</ModalStackContext.Provider>;
}

// Null outside the provider, for dialogs rendered on their own.
export function useModalStack() {
  return useContext(ModalStackContext);
}
