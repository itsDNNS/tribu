import { Plus, Check, Trash2, X, ShoppingCart } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useShopping } from '../hooks/useShopping';
import { t } from '../lib/i18n';

const MEMBER_COLORS = ['var(--member-1)', 'var(--member-2)', 'var(--member-3)', 'var(--member-4)'];

function ShoppingItem({ item, checked, members, messages, onToggle, onDelete }) {
  const addedBy = members.find((m) => m.user_id === item.added_by_user_id);
  const memberIdx = addedBy ? members.indexOf(addedBy) : 0;

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle(item.id, item.checked);
    }
  }

  return (
    <div
      className={`shopping-item${checked ? ' checked' : ''}`}
      role="checkbox"
      aria-checked={checked}
      aria-label={item.name}
      tabIndex={0}
      onClick={() => onToggle(item.id, item.checked)}
      onKeyDown={handleKeyDown}
    >
      <div className={`shopping-check${checked ? ' done' : ''}`} aria-hidden="true">
        {checked && <Check size={14} color="white" />}
      </div>
      <div className="shopping-item-info">
        <span className="shopping-item-name">{item.name}</span>
        {item.spec && <span className="shopping-spec">{item.spec}</span>}
      </div>
      {addedBy && (
        <div className="shopping-added-by" style={{ background: MEMBER_COLORS[memberIdx % MEMBER_COLORS.length] }}>
          {(addedBy.display_name || '?').charAt(0).toUpperCase()}
        </div>
      )}
      {onDelete && (
        <button
          className="shopping-item-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
          aria-label={t(messages, 'aria.delete_item').replace('{name}', item.name)}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default function ShoppingView() {
  const { familyId, families, members, messages, isMobile, isChild } = useApp();
  const sh = useShopping();

  return (
    <div>
      <div className="view-header">
        <div>
          <h1 className="view-title">{t(messages, 'module.shopping.name')}</h1>
          <div className="view-subtitle">
            {families.find((f) => String(f.family_id) === String(familyId))?.family_name || ''}
          </div>
        </div>
      </div>

      <div className="shopping-layout">
        {/* Lists Panel */}
        <div className={`shopping-lists-panel ${isMobile ? 'mobile' : ''}`}>
          {sh.shoppingLists.map((list) => (
            <button
              key={list.id}
              className={`shopping-list-card glass${list.id === sh.activeListId ? ' active' : ''}`}
              onClick={() => sh.setActiveListId(list.id)}
            >
              <div className="shopping-list-name">{list.name}</div>
              <div className="shopping-list-meta">
                {list.checked_count}/{list.item_count}
              </div>
              {list.id === sh.activeListId && !isChild && (
                <button
                  className="shopping-list-delete"
                  onClick={(e) => { e.stopPropagation(); sh.deleteList(list.id); }}
                  aria-label={t(messages, 'aria.delete_list').replace('{name}', list.name)}
                >
                  <X size={14} />
                </button>
              )}
            </button>
          ))}

          {!isChild && (
            sh.showCreateList ? (
              <form onSubmit={sh.createList} className="shopping-new-list-form">
                <input
                  className="form-input"
                  placeholder={t(messages, 'module.shopping.list_name_placeholder')}
                  value={sh.newListName}
                  onChange={(e) => sh.setNewListName(e.target.value)}
                  autoFocus
                  style={{ fontSize: '0.88rem', padding: '10px 14px' }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
                  <button className="btn-sm" type="submit"><Plus size={16} /></button>
                  <button className="btn-ghost" type="button" onClick={() => sh.setShowCreateList(false)}>
                    <X size={16} />
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="shopping-add-list-btn"
                onClick={() => sh.setShowCreateList(true)}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{t(messages, 'module.shopping.new_list')}</span>
              </button>
            )
          )}
        </div>

        {/* Items Panel */}
        <div className="shopping-items-panel">
          {sh.activeList ? (
            <div className="glass" style={{ overflow: 'hidden' }}>
              {/* Quick-Add Bar */}
              {!isChild && (
                <form onSubmit={sh.addItem} className="quick-add-bar">
                  <input
                    ref={sh.itemInputRef}
                    className="quick-add-input"
                    placeholder={t(messages, 'module.shopping.item_name_placeholder')}
                    value={sh.newItemName}
                    onChange={(e) => sh.setNewItemName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sh.itemInputRef.current?.form?.requestSubmit(); } }}
                    required
                  />
                  <input
                    className="quick-add-input shopping-spec-input"
                    placeholder={t(messages, 'module.shopping.item_spec_placeholder')}
                    value={sh.newItemSpec}
                    onChange={(e) => sh.setNewItemSpec(e.target.value)}
                    style={{ maxWidth: isMobile ? '100%' : 180 }}
                  />
                  <button className="quick-add-btn" type="submit" aria-label={t(messages, 'aria.add_item')}>
                    <Plus size={22} />
                  </button>
                </form>
              )}

              {/* Unchecked Items */}
              <div className="shopping-items-list stagger">
                {sh.uncheckedItems.length === 0 && sh.checkedItems.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.88rem', padding: 'var(--space-md)' }}>
                    {t(messages, 'module.shopping.no_items')}
                  </div>
                )}
                {sh.uncheckedItems.map((item) => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    checked={false}
                    members={members}
                    messages={messages}
                    onToggle={sh.toggleItem}
                    onDelete={isChild ? null : sh.deleteItem}
                  />
                ))}

                {/* Checked Section */}
                {sh.checkedItems.length > 0 && (
                  <>
                    <div className="shopping-divider">
                      {t(messages, 'module.shopping.checked_section')} ({sh.checkedItems.length})
                    </div>
                    {sh.checkedItems.map((item) => (
                      <ShoppingItem
                        key={item.id}
                        item={item}
                        checked={true}
                        members={members}
                        messages={messages}
                        onToggle={sh.toggleItem}
                        onDelete={isChild ? null : sh.deleteItem}
                      />
                    ))}
                    {!isChild && (
                      <div style={{ padding: '0 var(--space-md) var(--space-md)' }}>
                        <button className="btn-ghost" onClick={sh.clearChecked} style={{ width: '100%', justifyContent: 'center' }}>
                          <Trash2 size={14} aria-hidden="true" />
                          {t(messages, 'module.shopping.clear_checked')}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <div className="glass" style={{ padding: 'var(--space-xl)', textAlign: 'center' }}>
              <ShoppingCart size={48} style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-md)' }} aria-hidden="true" />
              <p style={{ color: 'var(--text-muted)' }}>{t(messages, 'module.shopping.no_lists')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
