import { createContext, useCallback, useContext, useRef, useState } from 'react';
import * as api from '../lib/api';

const DataContext = createContext(null);
export const useData = () => useContext(DataContext);

export function DataProvider({ children }) {
  const [summary, setSummary] = useState({ next_events: [], upcoming_birthdays: [] });
  const [events, setEvents] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [birthdays, setBirthdays] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [shoppingLists, setShoppingLists] = useState([]);
  const [activity, setActivity] = useState([]);
  const [quickCaptureInbox, setQuickCaptureInbox] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const lastEventIdRef = useRef(0);

  const loadDashboard = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetDashboard(fid);
    if (ok) setSummary(data);
  }, []);

  const loadEvents = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetEvents(fid);
    if (ok) setEvents(data);
  }, []);

  const loadContacts = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetContacts(fid);
    if (ok) setContacts(data);
  }, []);

  const loadBirthdays = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetBirthdays(fid);
    if (ok) setBirthdays(data);
  }, []);

  const loadTasks = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetTasks(fid);
    if (ok) setTasks(data);
  }, []);

  const loadShoppingLists = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetShoppingLists(fid);
    if (ok) setShoppingLists(data);
  }, []);

  const loadActivity = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetActivity(fid, 10, 0);
    if (ok) setActivity(Array.isArray(data?.items) ? data.items : []);
  }, []);

  const loadQuickCaptureInbox = useCallback(async (fid) => {
    const { ok, data } = await api.apiGetQuickCaptureInbox(fid, 10, 0);
    if (ok) setQuickCaptureInbox(Array.isArray(data?.items) ? data.items : []);
  }, []);

  const loadNotifications = useCallback(async () => {
    const { ok, data } = await api.apiGetNotifications(50, 0);
    if (ok) {
      setNotifications(data);
      setUnreadCount(data.filter((n) => !n.read).length);
      if (data.length) {
        lastEventIdRef.current = Math.max(lastEventIdRef.current, data[0].id);
      }
    }
  }, []);

  const resetData = useCallback(() => {
    setEvents([]);
    setSummary({ next_events: [], upcoming_birthdays: [] });
    setContacts([]);
    setBirthdays([]);
    setTasks([]);
    setShoppingLists([]);
    setActivity([]);
    setQuickCaptureInbox([]);
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const value = {
    summary, setSummary,
    events, setEvents,
    contacts, setContacts,
    birthdays, setBirthdays,
    tasks, setTasks,
    shoppingLists, setShoppingLists,
    activity, setActivity,
    quickCaptureInbox, setQuickCaptureInbox,
    notifications, setNotifications,
    unreadCount, setUnreadCount,
    lastEventIdRef,
    loadDashboard, loadEvents, loadContacts, loadBirthdays, loadTasks, loadShoppingLists, loadActivity, loadQuickCaptureInbox, loadNotifications,
    resetData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
