import {
  buildOccasions, buildPeople, claimState, easterSunday, formFromGift, nextBirthday, payloadFromForm, priceToCents,
  recipientKey, recipientLinks, viewFor,
} from '../../lib/gifts';

const today = new Date(2026, 8, 30);

function gift(fields) {
  return {
    id: 1, kind: 'idea', for_user_id: null, for_contact_id: null, for_person_name: null, title: 'Gift', occasion: null,
    occasion_date: null, status: 'idea', notes: null, current_price_cents: null, claimed_by_user_id: null,
    created_by_user_id: 1, ...fields,
  };
}

describe('who sees what', () => {
  test('ideas for me are hidden, my wishes hide who is on them', () => {
    expect(viewFor(gift({ for_user_id: 2 }), 2, true)).toBeNull();
    const view = viewFor(gift({ kind: 'wish', for_user_id: 2, claimed_by_user_id: 1, status: 'ordered', notes: 'x' }), 2, true);
    expect(view).toMatchObject({ for_me: true, status: 'idea', claimed_by_user_id: null, notes: null });
  });

  test('a contact or a typed name can be the member', () => {
    const links = recipientLinks([{ id: 5, full_name: 'Mama', member_user_id: 2 }, { id: 6, full_name: 'Opa Karl' }], [{ user_id: 2, display_name: 'Anna' }]);
    expect(viewFor(gift({ for_contact_id: 5 }), 2, true, links)).toBeNull();
    expect(recipientKey(gift({ for_contact_id: 5 }), links)).toBe('u:2');
    expect(recipientKey(gift({ for_person_name: '  Oma  Helga ' }))).toBe('n:oma helga');
    expect(recipientKey(gift({ for_person_name: 'opa karl' }), links)).toBe('c:6');
    expect(viewFor(gift({ for_person_name: 'Anna' }), 2, true, links)).toBeNull();
  });

  test('children see wishes and their own ideas', () => {
    expect(viewFor(gift({ for_user_id: 2, created_by_user_id: 1 }), 3, false)).toBeNull();
    expect(viewFor(gift({ for_user_id: 2, created_by_user_id: 3 }), 3, false)).not.toBeNull();
    expect(viewFor(gift({ kind: 'wish', for_user_id: 2, notes: 'secret' }), 3, false).notes).toBeNull();
  });

  test('claim states', () => {
    expect(claimState({ for_me: true }, 1)).toBe('hidden');
    expect(claimState(gift({}), 1)).toBe('open');
    expect(claimState(gift({ claimed_by_user_id: 1 }), 1)).toBe('mine');
    expect(claimState(gift({ claimed_by_user_id: 2 }), 1)).toBe('other');
  });
});

describe('occasions', () => {
  const birthdays = [
    { id: 1, person_name: 'Anna', month: 10, day: 8, year: 1987, member_user_id: 2 },
    { id: 2, person_name: 'Helga Müller', month: 10, day: 3, year: null },
    { id: 3, person_name: 'Far away', month: 6, day: 1 },
  ];

  test('birthdays gather their gifts, wishes and budget', () => {
    const gifts = [
      gift({ id: 1, for_user_id: 2, occasion: 'birthday', current_price_cents: 4000, claimed_by_user_id: 1 }),
      gift({ id: 2, kind: 'wish', for_user_id: 2 }),
      gift({ id: 3, for_person_name: 'Helga Müller', occasion: 'birthday', occasion_date: '2026-10-03' }),
    ];
    const items = buildOccasions({
      gifts, birthdays, meId: 1, isAdult: true, today, budgets: { 'birthday:2026-10-08:u:2': 8000 },
    });
    expect(items.map((item) => item.key)).toEqual([
      'birthday:2026-10-03:n:helga müller', 'birthday:2026-10-08:u:2', 'christmas:2026-12-24:family',
    ]);
    const anna = items[1];
    expect(anna).toMatchObject({ gift_ids: [1], claimed_count: 1, wish_count: 1, budget_cents: 8000, spent_cents: 4000, turns: 39, days_until: 8 });
    expect(items[0]).toMatchObject({ gift_ids: [3], claimed_count: 0 });
  });

  test('my own birthday shows my wishes only and no budget', () => {
    const gifts = [gift({ id: 1, for_user_id: 2, occasion: 'birthday' }), gift({ id: 2, kind: 'wish', for_user_id: 2, occasion: 'birthday' })];
    const [mine] = buildOccasions({ gifts, birthdays: birthdays.slice(0, 1), meId: 2, isAdult: true, today, budgets: { 'birthday:2026-10-08:u:2': 1 } });
    expect(mine).toMatchObject({ for_me: true, gift_ids: [2], budget_cents: null, spent_cents: null });
  });

  test('Easter only with gifts, dated occasions of their own', () => {
    const gifts = [gift({ id: 4, occasion: 'Wedding', occasion_date: '2026-11-02', for_person_name: 'Oma' })];
    const items = buildOccasions({ gifts, meId: 1, isAdult: true, today, days: 400 });
    expect(items.some((item) => item.occasion === 'easter')).toBe(false);
    expect(items.find((item) => item.occasion === 'Wedding')).toMatchObject({ recipient_key: 'n:oma', person_name: 'Oma', gift_count: 1 });
  });

  test('dates', () => {
    expect(easterSunday(2027)).toEqual(new Date(2027, 2, 28));
    expect(nextBirthday(2, 29, new Date(2027, 0, 1))).toEqual(new Date(2027, 1, 28));
    expect(nextBirthday(9, 1, today)).toEqual(new Date(2027, 8, 1));
  });
});

test('people: members first, then everyone gifts go to', () => {
  const members = [{ user_id: 1, display_name: 'Me' }, { user_id: 2, display_name: 'Anna' }];
  const gifts = [
    { ...gift({ id: 1, for_person_name: 'Oma' }), for_me: false },
    { ...gift({ id: 2, kind: 'wish', for_user_id: 2 }), for_me: false },
    { ...gift({ id: 3, for_user_id: 2, status: 'gifted' }), for_me: false },
  ];
  const people = buildPeople({ gifts, members, birthdays: [{ person_name: 'Oma', month: 10, day: 20 }], meId: 1, today });
  expect(people.map((person) => person.key)).toEqual(['u:2', 'n:oma']);
  expect(people[0]).toMatchObject({ wishes: [gifts[1]], gifted: [gifts[2]] });
  expect(people[1].nextBirthday).toEqual(new Date(2026, 9, 20));
});

test('the form round-trips a gift', () => {
  const form = formFromGift(gift({ for_contact_id: 9, occasion: 'Wedding', occasion_date: '2026-11-02', current_price_cents: 1999 }));
  expect(form).toMatchObject({ recipient: 'c:9', occasion: 'other', occasion_label: 'Wedding', price: '19.99' });
  expect(payloadFromForm({ ...form, title: ' Vase ' })).toMatchObject({
    title: 'Vase', for_contact_id: 9, for_user_id: null, occasion: 'Wedding', current_price_cents: 1999,
  });
  expect(priceToCents('12,5')).toBe(1250);
});
