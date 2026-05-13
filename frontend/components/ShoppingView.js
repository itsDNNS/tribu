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

function categoryLabel(messages, category) {
  return category || t(messages, 'module.shopping.uncategorized');
}

function groupItemsByCategory(items, messages) {
  const groups = new Map();
  items.forEach((item) => {
    const key = item.category?.trim() || '';
    if (!groups.has(key)) {
      groups.set(key, { key, label: categoryLabel(messages, key), items: [] });
    }
    groups.get(key).items.push(item);
  });
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function ShoppingCategoryGroup({ group, collapsed, onToggle, children }) {
  const itemsId = `shopping-category-${(group.key || 'uncategorized').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}-items`;

  return (
    <section className="shopping-category-group" aria-label={group.label}>
      <button
        className="shopping-category-header"
        type="button"
        onClick={() => onToggle(group.key)}
        aria-controls={itemsId}
        aria-expanded={!collapsed}
      >
        <span>{group.label}</span>
        <span className="shopping-category-count">{group.items.length}</span>
      </button>
      {!collapsed && <div id={itemsId} className="shopping-category-items">{children}</div>}
    </section>
  );
}

function blurActiveTextInput() {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) {
    active.blur();
  }
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
      onPointerDown={blurActiveTextInput}
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
  const { members, messages, isMobile, isChild } = useApp();
  const sh = useShopping();
  const [confirmAction, setConfirmAction] = useState(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templatesExpanded, setTemplatesExpanded] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState({});
  const [itemSuggestionsOpen, setItemSuggestionsOpen] = useState(false);
  const [activeItemSuggestion, setActiveItemSuggestion] = useState(null);
  const itemSuggestionQuery = sh.newItemName.trim().toLocaleLowerCase();
  const itemSuggestions = itemSuggestionQuery
    ? Array.from(new Set((sh.items || [])
        .map((item) => item.name)
        .filter((name) => name && name.toLocaleLowerCase().includes(itemSuggestionQuery))))
        .sort((a, b) => a.localeCompare(b))
    : [];
  const uncheckedGroups = groupItemsByCategory(sh.uncheckedItems, messages);
  const allGroups = groupItemsByCategory(sh.items, messages);
  const templatesVisible = !isMobile || templatesExpanded || showTemplateForm;
  const templatesToggleLabel = templatesVisible
    ? t(messages, 'module.shopping.hide_templates')
    : t(messages, 'module.shopping.show_templates');
  const showItemSuggestions = itemSuggestionsOpen && itemSuggestions.length > 0;
  const selectedItemSuggestion = showItemSuggestions && activeItemSuggestion !== null
    ? itemSuggestions[Math.min(activeItemSuggestion, itemSuggestions.length - 1)]
    : null;

  function closeItemSuggestions() {
    setItemSuggestionsOpen(false);
    setActiveItemSuggestion(null);
  }

  function selectItemSuggestion(name) {
    sh.setNewItemName(name);
    closeItemSuggestions();
    sh.itemInputRef.current?.focus();
  }

  function handleItemSuggestionKeyDown(e) {
    if (e.key === 'Enter') {
      if (selectedItemSuggestion) {
        e.preventDefault();
        selectItemSuggestion(selectedItemSuggestion);
        return;
      }
      e.preventDefault();
      sh.itemInputRef.current?.form?.requestSubmit();
      return;
    }

    if (!showItemSuggestions) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveItemSuggestion((current) => {
        if (current === null) return 0;
        return Math.min(current + 1, itemSuggestions.length - 1);
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveItemSuggestion((current) => {
        if (current === null) return itemSuggestions.length - 1;
        return Math.max(current - 1, 0);
      });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeItemSuggestions();
    }
  }

  function toggleCategory(category) {
    setCollapsedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  }

  function openTemplateForm(template = null) {
    setEditingTemplate(template);
    setTemplatesExpanded(true);
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
    <div className="shopping-page">
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
        {!isChild && !isMobile && (
          <section className="shopping-templates-panel" aria-label={t(messages, 'module.shopping.templates')}>
            <div className="shopping-templates-header">
              <h2>{t(messages, 'module.shopping.templates')}</h2>
              <div className="shopping-templates-actions">
                {isMobile && (
                  <button
                    className="btn-ghost shopping-template-toggle"
                    type="button"
                    aria-expanded={templatesVisible}
                    onClick={() => {
                      if (templatesVisible) closeTemplateForm();
                      setTemplatesExpanded((prev) => !prev);
                    }}
                  >
                    {templatesToggleLabel}
                  </button>
                )}
                {templatesVisible && (
                  <button
                    className="shopping-add-list-btn"
                    type="button"
                    onClick={() => openTemplateForm()}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>{t(messages, 'module.shopping.new_template')}</span>
                  </button>
                )}
              </div>
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
            {templatesVisible && (
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
            )}
          </section>
        )}

        {/* Items Panel */}
        <div className="shopping-items-panel">
          {sh.activeList ? (
            <div className="shopping-items-wrapper">
              <div className="shopping-active-header">
                <h1>{t(messages, 'module.shopping.name')}</h1>
                <div className="shopping-active-actions">
                  <select
                    className="form-input shopping-active-select"
                    value={sh.activeListId || ''}
                    onChange={(e) => {
                      const selected = sh.shoppingLists.find((list) => String(list.id) === e.target.value);
                      sh.setActiveListId(selected?.id ?? e.target.value);
                    }}
                    aria-label={t(messages, 'module.shopping.lists')}
                  >
                    {sh.shoppingLists.map((list) => (
                      <option key={list.id} value={list.id}>{list.name}</option>
                    ))}
                  </select>
                  {!isChild && (
                    <button
                      className="shopping-add-item-btn"
                      type="button"
                      onClick={() => sh.itemInputRef.current?.focus()}
                    >
                      <Plus size={16} aria-hidden="true" />
                      {t(messages, 'module.shopping.add_item')}
                    </button>
                  )}
                </div>
              </div>
              {/* Quick-Add Bar */}
              {!isChild && (
                <form onSubmit={sh.addItem} className="quick-add-bar">
                  <div
                    className="shopping-item-suggest-field"
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) closeItemSuggestions();
                    }}
                  >
                    <input
                      ref={sh.itemInputRef}
                      className="quick-add-input"
                      placeholder={t(messages, 'module.shopping.item_name_placeholder')}
                      value={sh.newItemName}
                      onChange={(e) => {
                        sh.setNewItemName(e.target.value);
                        setItemSuggestionsOpen(true);
                        setActiveItemSuggestion(null);
                      }}
                      onFocus={() => setItemSuggestionsOpen(true)}
                      onKeyDown={handleItemSuggestionKeyDown}
                      autoComplete="off"
                      aria-autocomplete="list"
                      aria-expanded={showItemSuggestions}
                      aria-controls="shopping-item-suggestions"
                      {...(selectedItemSuggestion ? { 'aria-activedescendant': `shopping-item-suggestion-${activeItemSuggestion}` } : {})}
                      required
                    />
                    {showItemSuggestions && (
                      <div
                        id="shopping-item-suggestions"
                        className="shopping-item-suggestions"
                        role="listbox"
                        aria-label={t(messages, 'module.shopping.item_name_placeholder')}
                      >
                        {itemSuggestions.map((name, index) => (
                          <button
                            id={`shopping-item-suggestion-${index}`}
                            key={name}
                            className={`shopping-item-suggestion${selectedItemSuggestion === name ? ' active' : ''}`}
                            type="button"
                            role="option"
                            aria-selected={selectedItemSuggestion === name}
                            onMouseDown={(e) => e.preventDefault()}
                            onPointerDown={(e) => e.preventDefault()}
                            onMouseEnter={() => setActiveItemSuggestion(index)}
                            onFocus={() => setActiveItemSuggestion(index)}
                            onClick={() => selectItemSuggestion(name)}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    className="quick-add-input shopping-spec-input"
                    placeholder={t(messages, 'module.shopping.item_spec_placeholder')}
                    value={sh.newItemSpec}
                    onChange={(e) => sh.setNewItemSpec(e.target.value)}
                  />
                  <input
                    className="quick-add-input shopping-category-input"
                    placeholder={t(messages, 'module.shopping.item_category_placeholder')}
                    value={sh.newItemCategory}
                    onChange={(e) => sh.setNewItemCategory(e.target.value)}
                  />
                  <button className="quick-add-btn" type="submit" aria-label={t(messages, 'aria.add_item')}>
                    <Plus size={22} />
                  </button>
                </form>
              )}

              <div className="shopping-market-layout">
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
                  {uncheckedGroups.map((group) => (
                    <ShoppingCategoryGroup
                      key={group.key || 'uncategorized'}
                      group={group}
                      collapsed={!!collapsedCategories[group.key]}
                      onToggle={toggleCategory}
                    >
                      {group.items.map((item) => (
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
                    </ShoppingCategoryGroup>
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

                {allGroups.length > 0 && (
                  <aside className="shopping-category-overview" aria-label={t(messages, 'module.shopping.items')}>
                    <div className="shopping-total-chip">
                      <span>{sh.items.length}</span>
                      <strong>{t(messages, 'module.shopping.items')}</strong>
                    </div>
                    {allGroups.map((group) => (
                      <div
                        key={group.key || 'uncategorized-overview'}
                        className={`shopping-category-overview-chip${collapsedCategories[group.key] ? ' muted' : ''}`}
                      >
                        <span>{group.label}</span>
                        <strong>{group.items.length}</strong>
                      </div>
                    ))}
                  </aside>
                )}
              </div>
            </div>
          ) : (
            <div className="shopping-no-lists">
              <h1>{t(messages, 'module.shopping.name')}</h1>
              <ShoppingCart size={48} className="shopping-no-lists-icon" aria-hidden="true" />
              <p>{t(messages, 'module.shopping.no_lists')}</p>
            </div>
          )}

        {/* Templates Panel */}
        {!isChild && isMobile && (
          <section className="shopping-templates-panel" aria-label={t(messages, 'module.shopping.templates')}>
            <div className="shopping-templates-header">
              <h2>{t(messages, 'module.shopping.templates')}</h2>
              <div className="shopping-templates-actions">
                {isMobile && (
                  <button
                    className="btn-ghost shopping-template-toggle"
                    type="button"
                    aria-expanded={templatesVisible}
                    onClick={() => {
                      if (templatesVisible) closeTemplateForm();
                      setTemplatesExpanded((prev) => !prev);
                    }}
                  >
                    {templatesToggleLabel}
                  </button>
                )}
                {templatesVisible && (
                  <button
                    className="shopping-add-list-btn"
                    type="button"
                    onClick={() => openTemplateForm()}
                  >
                    <Plus size={16} aria-hidden="true" />
                    <span>{t(messages, 'module.shopping.new_template')}</span>
                  </button>
                )}
              </div>
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
            {templatesVisible && (
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
            )}
          </section>
        )}
        </div>
      </div>
    </div>
  );
}
