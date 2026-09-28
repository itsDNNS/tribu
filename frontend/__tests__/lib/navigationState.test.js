import { resolveInitialView, resolveLaunchAction } from '../../lib/navigationState';
import { DEFAULT_NAV_ORDER } from '../../contexts/AppContext';

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

describe('resolveLaunchAction', () => {
  it('reads the home screen shortcut actions', () => {
    expect(resolveLaunchAction('?action=shopping-trip')).toBe('shopping-trip');
    expect(resolveLaunchAction('?action=new-shopping')).toBe('new-shopping');
    expect(resolveLaunchAction('?action=new-event')).toBe('new-event');
  });

  it('ignores anything else', () => {
    expect(resolveLaunchAction('?action=delete-everything')).toBeNull();
    expect(resolveLaunchAction('?view=tasks')).toBeNull();
    expect(resolveLaunchAction('')).toBeNull();
  });
});
