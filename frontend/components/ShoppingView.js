import { useState } from 'react';
import { Plus, Check, Trash2, X, ShoppingCart, Pencil } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { useShopping } from '../hooks/useShopping';
import { t } from '../lib/i18n';
import MemberAvatar from './MemberAvatar';
import ConfirmDialog from './ConfirmDialog';

const EMPTY_TEMPLATE_ITEM = { name: '', spec: '', category: '' };

function normaliseTemplateItems(items) {
  return items
    .map((item) => ({
      name: item.name.trim(),
      spec: item.spec?.trim() || null,
      category: item.category?.trim() || null,
    }))
    .filter((item) => item.name);
}

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
        {item.category && <span className="shopping-category-pill">{item.category}</span>}
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


function ShoppingTemplateForm({ messages, initialTemplate, onSubmit, onCancel }) {
  const [name, setName] = useState(initialTemplate?.name || '');
  const [items, setItems] = useState(
    initialTemplate?.items?.length
      ? initialTemplate.items.map((item) => ({
          name: item.name || '',
          spec: item.spec || '',
          category: item.category || '',
        }))
      : [{ ...EMPTY_TEMPLATE_ITEM }],
  );

  function updateDraftItem(index, field, value) {
    setItems((prev) => prev.map((item, idx) => idx === index ? { ...item, [field]: value } : item));
  }

  function addDraftItem() {
    setItems((prev) => [...prev, { ...EMPTY_TEMPLATE_ITEM }]);
  }

  function removeDraftItem(index) {
    setItems((prev) => prev.length === 1 ? [{ ...EMPTY_TEMPLATE_ITEM }] : prev.filter((_, idx) => idx !== index));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const cleanedItems = normaliseTemplateItems(items);
    if (!name.trim() || cleanedItems.length === 0) return;
    onSubmit({ name: name.trim(), items: cleanedItems });
  }

  return (
    <form className="shopping-template-form" onSubmit={handleSubmit}>
      <input
        className="form-input shopping-template-name-input"
        placeholder={t(messages, 'module.shopping.template_name_placeholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="shopping-template-items-editor">
        {items.map((item, index) => (
          <div className="shopping-template-item-row" key={index}>
            <input
              className="form-input"
              placeholder={t(messages, 'module.shopping.template_item_name_placeholder')}
              value={item.name}
              onChange={(e) => updateDraftItem(index, 'name', e.target.value)}
            />
            <input
              className="form-input"
              placeholder={t(messages, 'module.shopping.template_item_spec_placeholder')}
              value={item.spec}
              onChange={(e) => updateDraftItem(index, 'spec', e.target.value)}
            />
            <input
              className="form-input"
              placeholder={t(messages, 'module.shopping.template_item_category_placeholder')}
              value={item.category}
              onChange={(e) => updateDraftItem(index, 'category', e.target.value)}
            />
            <button
              className="btn-ghost shopping-template-remove-item"
              type="button"
              onClick={() => removeDraftItem(index)}
              aria-label={t(messages, 'module.shopping.remove_template_item')}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="shopping-template-form-actions">
        <button className="btn-ghost" type="button" onClick={addDraftItem}>
          <Plus size={14} aria-hidden="true" />
          {t(messages, 'module.shopping.add_template_item')}
        </button>
        <button className="btn-ghost" type="button" onClick={onCancel}>
          {t(messages, 'module.shopping.cancel_template')}
        </button>
        <button className="btn-sm" type="submit">
          {t(messages, 'module.shopping.save_template')}
        </button>
      </div>
    </form>
  );
}

function ShoppingTemplateCard({ template, messages, onApply, onEdit, onDelete }) {
  return (
    <article className="shopping-template-card">
      <div className="shopping-template-card-header">
        <div>
          <h3 className="shopping-template-title">{template.name}</h3>
          <div className="shopping-template-count">{template.item_count ?? template.items?.length ?? 0}</div>
        </div>
        <div className="shopping-template-card-actions">
          <button
            className="btn-ghost"
            type="button"
            onClick={() => onEdit(template)}
            aria-label={`${t(messages, 'module.shopping.edit_template')}: ${template.name}`}
          >
            <Pencil size={14} />
          </button>
          <button
            className="btn-ghost"
            type="button"
            onClick={() => onDelete(template.id)}
            aria-label={t(messages, 'aria.delete_template').replace('{name}', template.name)}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="shopping-template-items">
        {(template.items || []).map((item) => (
          <div className="shopping-template-item" key={item.id || `${item.name}-${item.spec}-${item.category}`}>
            <span className="shopping-template-item-name">{item.name}</span>
            {item.spec && <span className="shopping-spec">{item.spec}</span>}
            {item.category && <span className="shopping-category-pill">{item.category}</span>}
          </div>
        ))}
      </div>
      <button
        className="btn-sm shopping-template-apply"
        type="button"
        onClick={() => onApply(template.id)}
        aria-label={`${t(messages, 'module.shopping.apply_template')}: ${template.name}`}
      >
        <Plus size={14} aria-hidden="true" />
        {t(messages, 'module.shopping.apply_template')}
      </button>
    </article>
  );
}

export default function ShoppingView() {
  const { familyId, families, members, messages, isMobile, isChild } = useApp();
  const sh = useShopping();
  const [confirmAction, setConfirmAction] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const itemSuggestions = Array.from(new Set((sh.items || []).map((item) => item.name).filter(Boolean))).sort((a, b) => a.localeCompare(b));

  function openTemplateForm(template = null) {
    setEditingTemplate(template);
    setShowTemplateForm(true);
  }

  function closeTemplateForm() {
    setEditingTemplate(null);
    setShowTemplateForm(false);
  }

  async function submitTemplate(payload) {
    if (editingTemplate) {
      await sh.updateTemplate(editingTemplate.id, payload);
    } else {
      await sh.createTemplate(payload);
    }
    closeTemplateForm();
  }

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

      <div className={`shopping-layout${isChild ? ' shopping-layout-readonly' : ''}`}>
        {/* Lists Panel */}
        <div className={`shopping-lists-panel ${isMobile ? 'mobile' : ''}`}>
          {sh.shoppingLists.map((list) => (
            <div
              key={list.id}
              className={`shopping-list-card${list.id === sh.activeListId ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => sh.setActiveListId(list.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  sh.setActiveListId(list.id);
                }
              }}
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
            </div>
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

        {/* Templates Panel */}
        {!isChild && (
          <section className="shopping-templates-panel" aria-label={t(messages, 'module.shopping.templates')}>
            <div className="shopping-templates-header">
              <h2>{t(messages, 'module.shopping.templates')}</h2>
              <button
                className="shopping-add-list-btn"
                type="button"
                onClick={() => openTemplateForm()}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{t(messages, 'module.shopping.new_template')}</span>
              </button>
            </div>
            {showTemplateForm && (
              <ShoppingTemplateForm
                key={editingTemplate?.id || 'new'}
                messages={messages}
                initialTemplate={editingTemplate}
                onSubmit={submitTemplate}
                onCancel={closeTemplateForm}
              />
            )}
            <div className="shopping-template-list">
              {(sh.templates || []).map((template) => (
                <ShoppingTemplateCard
                  key={template.id}
                  template={template}
                  messages={messages}
                  onApply={sh.applyTemplate}
                  onEdit={openTemplateForm}
                  onDelete={sh.deleteTemplate}
                />
              ))}
            </div>
          </section>
        )}

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
                    list="shopping-item-suggestions"
                    required
                  />
                  <datalist id="shopping-item-suggestions">
                    {itemSuggestions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </datalist>
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
