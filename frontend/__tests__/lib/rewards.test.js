import {
  achievedFamilyGoals, currencyName, familyGoalProgress, goalFor, groupByDay,
  openFamilyGoals, personalWishes, waitingForAdults,
} from '../../lib/rewards';

const catalog = [
  { id: 1, name: 'Cinema', cost: 20, kind: 'personal', is_active: true },
  { id: 2, name: 'Ice cream', cost: 5, kind: 'personal', is_active: true },
  { id: 3, name: 'Old', cost: 1, kind: 'personal', is_active: false },
  { id: 4, name: 'Zoo', cost: 40, kind: 'family', is_active: true, progress: 30, contributions: [{ user_id: 7, amount: 20 }, { user_id: 8, amount: 10 }] },
  { id: 5, name: 'Pizza night', cost: 10, kind: 'family', is_active: false, achieved_at: '2026-09-01T10:00:00' },
];

describe('rewards helpers', () => {
  it('names the stars in the reader\'s language unless the family chose a name', () => {
    const messages = { 'module.rewards.stars': 'Sterne' };
    expect(currencyName({ name: '' }, messages)).toBe('Sterne');
    expect(currencyName({ name: 'Taler' }, messages)).toBe('Taler');
  });

  it('separates personal wishes from family goals', () => {
    expect(personalWishes(catalog).map((w) => w.name)).toEqual(['Ice cream', 'Cinema']);
    expect(openFamilyGoals(catalog).map((w) => w.name)).toEqual(['Zoo']);
    expect(achievedFamilyGoals(catalog).map((w) => w.name)).toEqual(['Pizza night']);
  });

  it('follows the chosen goal, and falls back only when asked', () => {
    const chosen = goalFor({ balance: 12, goal_reward_id: 1 }, catalog);
    expect(chosen).toMatchObject({ chosen: true, remaining: 8, reached: false });
    expect(chosen.progress).toBeCloseTo(0.6);
    expect(goalFor({ balance: 12 }, catalog)).toBeNull();
    expect(goalFor({ balance: 3 }, catalog, { fallback: true })).toMatchObject({ chosen: false, cost: 5 });
    expect(goalFor({ balance: 6, goal_reward_id: 2 }, catalog).reached).toBe(true);
  });

  it('measures a family goal with each member\'s share', () => {
    const progress = familyGoalProgress(catalog[3]);
    expect(progress).toMatchObject({ cost: 40, progress: 30, missing: 10, reached: false });
    expect(progress.shares.map((s) => s.fraction)).toEqual([0.5, 0.25]);
  });

  it('collects what waits for a grown-up', () => {
    const waiting = waitingForAdults([
      { id: 1, kind: 'redeem', status: 'pending' },
      { id: 2, kind: 'earn', status: 'pending' },
      { id: 3, kind: 'redeem', status: 'confirmed', fulfilled_at: null },
      { id: 4, kind: 'redeem', status: 'confirmed', fulfilled_at: '2026-09-01' },
      { id: 5, kind: 'give', status: 'confirmed' },
    ]);
    expect([waiting.wishes, waiting.earnings, waiting.toGive].map((list) => list.map((x) => x.id))).toEqual([[1], [2], [3]]);
    expect(waiting.count).toBe(3);
  });

  it('groups the history by day', () => {
    const groups = groupByDay([
      { id: 1, created_at: '2026-09-30T18:00:00' },
      { id: 2, created_at: '2026-09-30T08:00:00' },
      { id: 3, created_at: '2026-09-28T08:00:00' },
    ]);
    expect(groups.map((g) => g.items.map((i) => i.id))).toEqual([[1, 2], [3]]);
  });
});

describe('rewards helpers with odd answers', () => {
  it('treat anything but a list as empty', () => {
    expect(personalWishes({})).toEqual([]);
    expect(openFamilyGoals(null)).toEqual([]);
    expect(waitingForAdults({}).count).toBe(0);
    expect(goalFor({ balance: 3 }, {}, { fallback: true })).toBeNull();
  });
});
