import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../contexts/ToastContext';
import { t } from '../lib/i18n';
import { errorText } from '../lib/helpers';
import * as api from '../lib/api';
import {
  buildOccasions, isoDate, nextBirthday, nextHoliday, recipientLinks, recipientMember, startOfToday, viewFor,
} from '../lib/gifts';

const DEMO_GIFTS = {
  en: {
    scarf: 'Silk scarf', gardenBook: 'Book about cottage gardens', headphones: 'Noise-cancelling headphones',
    lego: 'LEGO Technic excavator', boots: 'Football boots', paints: 'Watercolour set', ebook: 'E-reader',
    bike: 'Bike with gears', sophie: 'Concert tickets', note: 'Size 34, preferably black', helmet: 'With a helmet',
  },
  de: {
    scarf: 'Seidenschal', gardenBook: 'Buch über Bauerngärten', headphones: 'Kopfhörer mit Geräuschunterdrückung',
    lego: 'LEGO Technic Bagger', boots: 'Fußballschuhe', paints: 'Aquarellkasten', ebook: 'E-Book-Reader',
    bike: 'Fahrrad mit Gangschaltung', sophie: 'Konzertkarten', note: 'Größe 34, am liebsten schwarz', helmet: 'Mit Helm',
  },
};

function isoAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

// A family a few weeks before the next birthdays: Anna takes care of
// Helga's scarf, Dennis ordered Max's excavator, nothing yet for Thomas,
// and a bike waits for Christmas.
function demoState(copy, members, birthdays, me, familyId) {
  const fid = Number(familyId) || 1;
  const today = startOfToday();
  const adults = members.filter((member) => member.is_adult);
  const kids = members.filter((member) => !member.is_adult);
  const meId = me?.user_id ?? adults[0]?.user_id ?? 1;
  const partner = adults.find((member) => member.user_id !== meId) || adults[0];
  const [firstKid, secondKid] = kids;
  const byName = (name) => birthdays.find((birthday) => birthday.person_name === name) || birthdays[0];
  const birthdayOf = (birthday) => (birthday ? isoDate(nextBirthday(birthday.month, birthday.day, today)) : null);
  const helga = byName('Helga Müller');
  const sophie = byName('Sophie Weber');
  const christmas = isoDate(nextHoliday('christmas', today));
  let id = 0;
  const gift = (fields) => ({
    id: ++id, family_id: fid, kind: 'idea', for_user_id: null, for_contact_id: null, for_person_name: null,
    description: null, url: null, image: null, occasion: null, occasion_date: null, status: 'idea', notes: null,
    current_price_cents: null, currency: 'EUR', gifted_at: null, claimed_by_user_id: null, claimed_at: null,
    created_by_user_id: meId, created_at: isoAgo(10 - id), updated_at: isoAgo(10 - id), ...fields,
  });
  const gifts = [
    helga && gift({ for_person_name: helga.person_name, title: copy.scarf, occasion: 'birthday', occasion_date: birthdayOf(helga), current_price_cents: 3900, status: 'purchased', claimed_by_user_id: partner?.user_id, claimed_at: isoAgo(3), created_by_user_id: partner?.user_id, url: 'https://example.com/scarf' }),
    helga && gift({ for_person_name: helga.person_name, title: copy.gardenBook, occasion: 'birthday', occasion_date: birthdayOf(helga), current_price_cents: 2400 }),
    firstKid && gift({ kind: 'wish', for_user_id: firstKid.user_id, title: copy.lego, current_price_cents: 4999, status: 'ordered', claimed_by_user_id: meId, claimed_at: isoAgo(2), created_by_user_id: firstKid.user_id }),
    firstKid && gift({ kind: 'wish', for_user_id: firstKid.user_id, title: copy.boots, description: copy.note, current_price_cents: 5995, created_by_user_id: firstKid.user_id }),
    secondKid && gift({ kind: 'wish', for_user_id: secondKid.user_id, title: copy.paints, current_price_cents: 1899, created_by_user_id: secondKid.user_id }),
    partner && gift({ kind: 'wish', for_user_id: partner.user_id, title: copy.ebook, current_price_cents: 14999, created_by_user_id: partner.user_id }),
    gift({ kind: 'wish', for_user_id: meId, title: copy.headphones, current_price_cents: 24900, created_by_user_id: meId, claimed_by_user_id: partner?.user_id, status: 'ordered' }),
    partner && gift({ for_user_id: meId, title: copy.sophie, created_by_user_id: partner.user_id }),
    (secondKid || firstKid) && gift({ for_user_id: (secondKid || firstKid).user_id, title: copy.bike, description: copy.helmet, occasion: 'christmas', occasion_date: christmas, current_price_cents: 29900 }),
    sophie && gift({ for_person_name: sophie.person_name, title: copy.sophie, occasion: 'birthday', occasion_date: birthdayOf(sophie), current_price_cents: 8800, created_by_user_id: partner?.user_id }),
  ].filter(Boolean);
  const budgets = {
    [`christmas:${christmas}:family`]: 60000,
    ...(helga ? { [`birthday:${birthdayOf(helga)}:n:${helga.person_name.toLocaleLowerCase()}`]: 8000 } : {}),
  };
  return { gifts, budgets, nextId: id + 1 };
}

export function useGifts() {
  const { familyId, me, demoMode, messages, members = [], birthdays = [], contacts = [], lang, isChild } = useApp();
  const { success: toastSuccess, error: toastError } = useToast();
  const isAdult = !isChild;
  const meId = me?.user_id;

  const [gifts, setGifts] = useState([]);
  const [occasions, setOccasions] = useState([]);
  const [loading, setLoading] = useState(true);
  const demo = useRef(null);

  const demoRefresh = useCallback(() => {
    const state = demo.current;
    const links = recipientLinks(contacts, members);
    setGifts(state.gifts.map((gift) => viewFor(gift, meId, isAdult, links)).filter(Boolean));
    setOccasions(buildOccasions({
      gifts: state.gifts, birthdays, contacts, members, budgets: state.budgets, meId, isAdult, today: startOfToday(),
    }));
  }, [contacts, members, birthdays, meId, isAdult]);

  const load = useCallback(async () => {
    if (demoMode) {
      if (!demo.current) demo.current = demoState(DEMO_GIFTS[lang] || DEMO_GIFTS.en, members, birthdays, me, familyId);
      demoRefresh();
      setLoading(false);
      return;
    }
    if (!familyId) return;
    const [listRes, occasionRes] = await Promise.all([
      api.apiGetGifts(familyId, { limit: 200 }).catch(() => ({ ok: false })),
      api.apiGetGiftOccasions(familyId).catch(() => ({ ok: false })),
    ]);
    if (listRes.ok && Array.isArray(listRes.data?.items)) setGifts(listRes.data.items);
    if (occasionRes.ok && Array.isArray(occasionRes.data?.items)) setOccasions(occasionRes.data.items);
    setLoading(false);
  }, [demoMode, familyId, lang, members, birthdays, me, demoRefresh]);

  useEffect(() => { load(); }, [load]);

  const fail = useCallback((data) => {
    toastError(errorText(data?.detail, t(messages, 'toast.error'), messages));
    return false;
  }, [toastError, messages]);

  // The demo plays the server: same rules, kept in memory.
  const demoChange = useCallback((giftId, change) => {
    const state = demo.current;
    state.gifts = state.gifts.map((gift) => (gift.id === giftId ? { ...gift, ...change(gift), updated_at: new Date().toISOString() } : gift));
    demoRefresh();
    return true;
  }, [demoRefresh]);

  const save = useCallback(async (payload, existing) => {
    if (demoMode) {
      const state = demo.current;
      if (existing) {
        demoChange(existing.id, () => payload);
      } else {
        state.gifts = [...state.gifts, {
          id: state.nextId++, family_id: Number(familyId) || 1, status: 'idea', gifted_at: null, claimed_by_user_id: null,
          claimed_at: null, created_by_user_id: meId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          notes: null, ...payload,
        }];
        demoRefresh();
      }
    } else {
      const { ok, data } = existing
        ? await api.apiUpdateGift(existing.id, payload)
        : await api.apiCreateGift({ family_id: Number(familyId), ...payload });
      if (!ok) return fail(data);
      await load();
    }
    toastSuccess(t(messages, existing ? 'module.gifts.updated' : (payload.kind === 'wish' ? 'module.gifts.wish_added' : 'module.gifts.created')));
    return true;
  }, [demoMode, demoChange, demoRefresh, familyId, meId, fail, load, toastSuccess, messages]);

  const remove = useCallback(async (gift) => {
    if (demoMode) {
      demo.current.gifts = demo.current.gifts.filter((item) => item.id !== gift.id);
      demoRefresh();
    } else {
      const { ok, data } = await api.apiDeleteGift(gift.id);
      if (!ok) return fail(data);
      await load();
    }
    toastSuccess(t(messages, 'module.gifts.deleted'));
    return true;
  }, [demoMode, demoRefresh, fail, load, toastSuccess, messages]);

  const claim = useCallback(async (gift) => {
    if (demoMode) return demoChange(gift.id, () => ({ claimed_by_user_id: meId, claimed_at: new Date().toISOString() }));
    const { ok, data } = await api.apiClaimGift(gift.id);
    if (!ok) {
      await load();
      return fail(data);
    }
    await load();
    return true;
  }, [demoMode, demoChange, meId, fail, load]);

  const unclaim = useCallback(async (gift) => {
    if (demoMode) {
      return demoChange(gift.id, (current) => ({
        claimed_by_user_id: null, claimed_at: null,
        status: ['ordered', 'purchased'].includes(current.status) ? 'idea' : current.status,
      }));
    }
    const { ok, data } = await api.apiUnclaimGift(gift.id);
    if (!ok) return fail(data);
    await load();
    return true;
  }, [demoMode, demoChange, fail, load]);

  const setStatus = useCallback(async (gift, status) => {
    if (demoMode) {
      return demoChange(gift.id, (current) => ({
        status,
        gifted_at: status === 'gifted' ? current.gifted_at || new Date().toISOString() : null,
        ...(status !== 'idea' && current.claimed_by_user_id == null ? { claimed_by_user_id: meId, claimed_at: new Date().toISOString() } : {}),
      }));
    }
    const { ok, data } = await api.apiUpdateGift(gift.id, { status });
    if (!ok) return fail(data);
    await load();
    if (status === 'gifted') toastSuccess(t(messages, 'module.gifts.given_toast'));
    return true;
  }, [demoMode, demoChange, meId, fail, load, toastSuccess, messages]);

  const setBudget = useCallback(async (occasion, amountCents) => {
    const payload = {
      family_id: Number(familyId), occasion: occasion.occasion, occasion_date: occasion.date,
      recipient_key: occasion.recipient_key, amount_cents: amountCents,
    };
    if (demoMode) {
      const key = `${occasion.occasion}:${occasion.date}:${occasion.recipient_key}`;
      if (amountCents == null) delete demo.current.budgets[key];
      else demo.current.budgets[key] = amountCents;
      demoRefresh();
      return true;
    }
    const { ok, data } = await api.apiSetGiftBudget(payload);
    if (!ok) return fail(data);
    await load();
    return true;
  }, [demoMode, demoRefresh, familyId, fail, load]);

  const preview = useCallback(async (url) => {
    if (demoMode) return { ok: false, data: { detail: t(messages, 'module.gifts.demo_preview') } };
    return api.apiPreviewGiftLink(Number(familyId), url);
  }, [demoMode, familyId, messages]);

  const giftsById = useMemo(() => new Map(gifts.map((gift) => [gift.id, gift])), [gifts]);
  const links = useMemo(() => recipientLinks(contacts, members), [contacts, members]);
  const myWishes = useMemo(
    () => gifts.filter((gift) => gift.kind === 'wish' && recipientMember(gift, links) === meId),
    [gifts, links, meId],
  );

  return {
    loading, gifts, giftsById, occasions, myWishes, isAdult, meId,
    save, remove, claim, unclaim, setStatus, setBudget, preview, reload: load,
  };
}
