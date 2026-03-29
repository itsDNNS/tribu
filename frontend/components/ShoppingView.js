import { useState } from 'react';
import { Plus, Check, Trash2, X, ShoppingCart } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useShopping } from '../hooks/useShopping';
import { t } from '../lib/i18n';
import MemberAvatar from './MemberAvatar';
import ConfirmDialog from './ConfirmDialog';

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
      {addedBy && <MemberAvatar member={addedBy} index={memberIdx} size={22} />}
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
  const [confirmAction, setConfirmAction] = useState(null);

  return (
    <div>
      {confirmAction && (
        <ConfirmDialog
          title={confirmAction.title}
          message={confirmAction.message}
          confirmDanger={confirmAction.danger}
          onConfirm={confirmAction.action}
          onCancel={() => setConfirmAction(null)}
          messages={messages}
        />
      )}
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
              className={`shopping-list-card${list.id === sh.activeListId ? ' active' : ''}`}
              onClick={() => sh.setActiveListId(list.id)}
            >
              <div className="shopping-list-name">{list.name}</div>
              <div className="shopping-list-meta">
                {list.checked_count}/{list.item_count}
              </div>
              {list.id === sh.activeListId && !isChild && (
                <button
                  className="shopping-list-delete"
                  onClick={(e) => { e.stopPropagation(); setConfirmAction({
                    title: t(messages, 'module.shopping.delete_list'),
                    message: t(messages, 'module.shopping.delete_list_confirm'),
                    danger: true,
                    action: () => { sh.deleteList(list.id); setConfirmAction(null); },
                  }); }}
                  aria-label={t(messages, 'aria.delete_list').replace('{name}', list.name)}
                >
                  <X size={14} />
                </button>
              )}
              {list.item_count > 0 && (
                <div className="shopping-list-progress" aria-hidden="true">
                  <div className="shopping-list-progress-fill" style={{ width: `${Math.round((list.checked_count / list.item_count) * 100)}%` }} />
                </div>
              )}
            </button>
          ))}

          {!isChild && (
            sh.showCreateList ? (
              <form onSubmit={sh.createList} className="shopping-new-list-form">
                <input
                  className="form-input shopping-new-list-input"
                  placeholder={t(messages, 'module.shopping.list_name_placeholder')}
                  value={sh.newListName}
                  onChange={(e) => sh.setNewListName(e.target.value)}
                  autoFocus
                />
                <div className="shopping-new-list-actions">
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
            <div className="shopping-items-wrapper">
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
                  />
                  <button className="quick-add-btn" type="submit" aria-label={t(messages, 'aria.add_item')}>
                    <Plus size={22} />
                  </button>
                </form>
              )}

              {/* Unchecked Items */}
              <div className="shopping-items-list">
                {sh.uncheckedItems.length === 0 && sh.checkedItems.length === 0 && (
                  <div className="shopping-empty">
                    <span>{t(messages, 'module.shopping.no_items')}</span>
                    {!isChild && (
                      <button className="bento-empty-action" onClick={() => sh.itemInputRef.current?.focus()}>
                        {t(messages, 'module.shopping.add_first_item')}
                      </button>
                    )}
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
                      <div className="shopping-clear-wrapper">
                        <button className="btn-ghost shopping-clear-btn" onClick={() => setConfirmAction({
                        title: t(messages, 'module.shopping.clear_checked'),
                        message: t(messages, 'module.shopping.clear_checked_confirm'),
                        danger: true,
                        action: () => { sh.clearChecked(); setConfirmAction(null); },
                      })}>
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
            <div className="shopping-no-lists">
              <ShoppingCart size={48} className="shopping-no-lists-icon" aria-hidden="true" />
              <p>{t(messages, 'module.shopping.no_lists')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
