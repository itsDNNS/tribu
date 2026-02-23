export const styles = {
  page: { minHeight: '100vh', padding: 12 },
  hero: { background: 'linear-gradient(135deg, #111827 0%, #4c1d95 100%)', color: '#fff', padding: 20, borderRadius: 14, maxWidth: 900, margin: '0 auto' },
  cardNarrow: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, maxWidth: 420, width: '100%', boxSizing: 'border-box', margin: '12px auto' },
  layout: { display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16, maxWidth: 1280, margin: '0 auto' },
  sidebar: { border: '1px solid #e5e7eb', borderRadius: 14, padding: 14, minHeight: '80vh', display: 'flex', flexDirection: 'column', gap: 8 },
  content: { display: 'grid', gap: 12 },
  card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: 16, color: '#111827' },
  smallCard: { border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, display: 'grid', gap: 4 },
  input: { border: '1px solid #d1d5db', borderRadius: 10, padding: '10px 12px', fontSize: 16, minHeight: 44, width: '100%', maxWidth: '100%', boxSizing: 'border-box' },
  formGrid: { display: 'grid', gap: 8 },
  primaryBtn: { border: 'none', borderRadius: 10, padding: '10px 14px', background: '#4f46e5', color: '#fff', cursor: 'pointer', boxSizing: 'border-box' },
  secondaryBtn: { border: '1px solid #d1d5db', borderRadius: 10, padding: '9px 12px', background: '#fff', cursor: 'pointer', boxSizing: 'border-box' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 },
};

export function navBtn(active, tokens) {
  return {
    border: active ? `1px solid ${tokens.primary}` : `1px solid ${tokens.border}`,
    background: active ? tokens.sidebarActive : tokens.sidebar,
    color: tokens.text,
    borderRadius: 10,
    padding: '10px 12px',
    cursor: 'pointer',
    textAlign: 'left',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  };
}

export function buildUi(tokens) {
  return {
    card: { ...styles.card, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    smallCard: { ...styles.smallCard, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    input: { ...styles.input, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    secondaryBtn: { ...styles.secondaryBtn, background: tokens.surface, borderColor: tokens.border, color: tokens.text },
    primaryBtn: { ...styles.primaryBtn, background: tokens.primary, color: tokens.primaryText },
  };
}
