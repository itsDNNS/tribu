import {useState} from 'react';
import {Plus, X, Pencil, Trash2} from 'lucide-react';
import {t} from '../../lib/i18n';
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

export function ShoppingTemplateForm({ messages, initialTemplate, onSubmit, onCancel }) {
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

export function ShoppingTemplateCard({ template, messages, onApply, onEdit, onDelete }) {
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
