import { createContext, useCallback, useContext, useState } from 'react';
import * as api from '../lib/api';

const FamilyContext = createContext(null);
export const useFamily = () => useContext(FamilyContext);

export function FamilyProvider({ children }) {
  const [familyId, setFamilyId] = useState('1');
  const [families, setFamilies] = useState([]);
  const [myFamilyRole, setMyFamilyRole] = useState('member');
  const [myFamilyIsAdult, setMyFamilyIsAdult] = useState(true);
  const [members, setMembers] = useState([]);

  const loadMembers = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetMembers(fid);
    if (ok) setMembers(data);
  }, []);

  const isAdmin = myFamilyRole === 'admin' || myFamilyRole === 'owner';
  const isChild = !isAdmin && !myFamilyIsAdult;

  const value = {
    familyId, setFamilyId,
    families, setFamilies,
    myFamilyRole, setMyFamilyRole,
    myFamilyIsAdult, setMyFamilyIsAdult,
    members, setMembers,
    loadMembers,
    isAdmin, isChild,
  };

  return <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>;
}
