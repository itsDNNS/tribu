import { resolveInitialView } from '../../lib/navigationState';
import { DEFAULT_NAV_ORDER } from '../../contexts/UIContext';

describe('resolveInitialView', () => {
  it('prioritizes bookmarkable hash routes over PWA shortcut query strings and stored view', () => {
    expect(resolveInitialView({
      hash: '#calendar',
      search: '?view=tasks',
      storedView: 'shopping',
      validViews: DEFAULT_NAV_ORDER,
    })).toBe('calendar');
  });

  it('supports manifest shortcut query URLs before falling back to session state', () => {
    expect(resolveInitialView({
      hash: '',
      search: '?view=shopping',
      storedView: 'dashboard',
      validViews: DEFAULT_NAV_ORDER,
    })).toBe('shopping');
  });

  it('ignores non-shortcut query views while still allowing stored navigation state', () => {
    expect(resolveInitialView({
      hash: '',
      search: '?view=admin',
      storedView: 'settings',
      validViews: DEFAULT_NAV_ORDER,
    })).toBe('settings');
  });

  it('ignores unknown views from URLs and storage', () => {
    expect(resolveInitialView({
      hash: '#unknown',
      search: '?view=admin<script>',
      storedView: 'bad-view',
      validViews: DEFAULT_NAV_ORDER,
    })).toBeNull();
  });
});
