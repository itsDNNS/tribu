import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckSquare, Pencil, Plus, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { t } from '../lib/i18n';
import {
  apiApplyHouseholdTemplate,
  apiCreateHouseholdTemplate,
  apiDeleteHouseholdTemplate,
  apiGetHouseholdTemplates,
  apiUpdateHouseholdTemplate,
} from '../lib/api';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(familyId) {
  return {
    family_id: Number(familyId),
    name: '',
    description: '',
    task_items: [],
    shopping_items: [],
  };
}

function normalizeTemplate(template) {
  return {
    ...template,
    task_items: template.task_items || [],
    shopping_items: template.shopping_items || [],
    task_count: template.task_count ?? (template.task_items || []).length,
    shopping_count: template.shopping_count ?? (template.shopping_items || []).length,
  };
}

export default function TemplatesView() {
  const { familyId, messages, isChild } = useApp();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [form, setForm] = useState(() => emptyForm(familyId));
  const [draftTask, setDraftTask] = useState({ title: '', days_offset: 0 });
  const [draftShopping, setDraftShopping] = useState({ name: '', spec: '' });
  const [targetDate, setTargetDate] = useState(todayIso());
  const [shoppingListName, setShoppingListName] = useState('');

  const loadTemplates = useCallback(async () => {
    if (!familyId || isChild) return;
    setLoading(true);
    setError('');
    const res = await apiGetHouseholdTemplates(familyId);
    if (res.ok) {
      setTemplates((res.data || []).map(normalizeTemplate));
    } else {
      setError(t(messages, 'module.templates.error'));
    }
    setLoading(false);
  }, [familyId, isChild, messages]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setForm((prev) => ({ ...prev, family_id: Number(familyId) }));
  }, [familyId]);

  const builtInTemplates = useMemo(() => templates.filter((template) => template.is_builtin), [templates]);
  const customTemplates = useMemo(() => templates.filter((template) => !template.is_builtin), [templates]);

  function startCreate() {
    setEditingTemplate(null);
    setForm(emptyForm(familyId));
    setDraftTask({ title: '', days_offset: 0 });
    setDraftShopping({ name: '', spec: '' });
    setFormOpen(true);
  }

  function startEdit(template) {
    setEditingTemplate(template);
    setForm({
      family_id: Number(familyId),
      name: template.name,
      description: template.description || '',
      task_items: template.task_items || [],
      shopping_items: template.shopping_items || [],
    });
    setDraftTask({ title: '', days_offset: 0 });
    setDraftShopping({ name: '', spec: '' });
    setFormOpen(true);
  }

  function addTaskItem() {
    const title = draftTask.title.trim();
    if (!title) return;
    setForm((prev) => ({
      ...prev,
      task_items: [...prev.task_items, { title, description: '', priority: 'normal', days_offset: Number(draftTask.days_offset) || 0 }],
    }));
    setDraftTask({ title: '', days_offset: 0 });
  }

  function addShoppingItem() {
    const name = draftShopping.name.trim();
    if (!name) return;
    setForm((prev) => ({
      ...prev,
      shopping_items: [...prev.shopping_items, { name, spec: draftShopping.spec.trim() || null, category: null }],
    }));
    setDraftShopping({ name: '', spec: '' });
  }

  async function saveTemplate(event) {
    event.preventDefault();
    const payload = {
      ...form,
      family_id: Number(familyId),
      name: form.name.trim(),
      description: form.description.trim() || null,
    };
    if (!payload.name) return;
    const res = editingTemplate
      ? await apiUpdateHouseholdTemplate(editingTemplate.id, payload)
      : await apiCreateHouseholdTemplate(payload);
    if (res.ok) {
      setStatus(t(messages, 'module.templates.created'));
      setFormOpen(false);
      setEditingTemplate(null);
      await loadTemplates();
    } else {
      setError(t(messages, 'module.templates.error'));
    }
  }

  async function applyTemplate(template) {
    const payload = {
      target_date: targetDate,
      shopping_list_name: shoppingListName.trim() || undefined,
    };
    if (template.is_builtin) payload.family_id = Number(familyId);
    const res = await apiApplyHouseholdTemplate(template, payload);
    if (res.ok) {
      setStatus(t(messages, 'module.templates.applied'));
    } else {
      setError(t(messages, 'module.templates.error'));
    }
  }

  async function deleteTemplate(template) {
    if (template.is_builtin) return;
    const res = await apiDeleteHouseholdTemplate(template.id);
    if (res.ok) {
      setStatus(t(messages, 'module.templates.deleted'));
      await loadTemplates();
    } else {
      setError(t(messages, 'module.templates.error'));
    }
  }

  function renderTemplateCard(template) {
    return (
      <article key={template.id} className="template-card glass-sm">
        <div className="template-card-header">
          <div>
            <div className="template-card-title-row">
              <h3>{template.name}</h3>
              <span className={`template-badge ${template.is_builtin ? 'builtin' : 'custom'}`}>
                {template.is_builtin ? t(messages, 'module.templates.builtin') : t(messages, 'module.templates.custom_badge')}
              </span>
            </div>
            {template.description && <p>{template.description}</p>}
          </div>
        </div>
        <div className="template-stats" aria-label={`${template.task_count} tasks, ${template.shopping_count} shopping items`}>
          <span><CheckSquare size={15} aria-hidden="true" /> {template.task_count}</span>
          <span><ShoppingCart size={15} aria-hidden="true" /> {template.shopping_count}</span>
        </div>
        <div className="template-preview-grid">
          <div>
            <h4>{t(messages, 'module.templates.tasks')}</h4>
            <ul>
              {(template.task_items || []).slice(0, 3).map((item, index) => <li key={`${template.id}-task-${index}`}>{item.title}</li>)}
            </ul>
          </div>
          <div>
            <h4>{t(messages, 'module.templates.shopping')}</h4>
            <ul>
              {(template.shopping_items || []).slice(0, 3).map((item, index) => <li key={`${template.id}-shop-${index}`}>{item.name}{item.spec ? ` · ${item.spec}` : ''}</li>)}
            </ul>
          </div>
        </div>
        <div className="template-actions">
          <button className="btn-primary small" onClick={() => applyTemplate(template)} aria-label={`${t(messages, 'module.templates.apply')} ${template.name}`}>
            <Sparkles size={15} aria-hidden="true" /> {t(messages, 'module.templates.apply')}
          </button>
          {!template.is_builtin && (
            <>
              <button className="btn-ghost small" onClick={() => startEdit(template)} aria-label={`${t(messages, 'module.templates.edit')} ${template.name}`}>
                <Pencil size={15} aria-hidden="true" /> {t(messages, 'module.templates.edit')}
              </button>
              <button className="btn-ghost small danger" onClick={() => deleteTemplate(template)} aria-label={`${t(messages, 'module.templates.delete')} ${template.name}`}>
                <Trash2 size={15} aria-hidden="true" /> {t(messages, 'module.templates.delete')}
              </button>
            </>
          )}
        </div>
      </article>
    );
  }

  if (isChild) {
    return (
      <div className="view-stack">
        <div className="view-header"><h1>{t(messages, 'module.templates.name')}</h1></div>
        <div className="empty-state glass">{t(messages, 'module.templates.adult_only')}</div>
      </div>
    );
  }

  return (
    <div className="view-stack templates-view">
      <div className="view-header templates-header">
        <div>
          <h1>{t(messages, 'module.templates.name')}</h1>
          <p>{t(messages, 'module.templates.subtitle')}</p>
        </div>
        <button className="btn-primary" onClick={startCreate}>
          <Plus size={17} aria-hidden="true" /> {t(messages, 'module.templates.new')}
        </button>
      </div>

      {(status || error) && (
        <div className={error ? 'status-banner error' : 'status-banner'} role="status">
          {error || status}
        </div>
      )}

      <section className="templates-apply-panel glass-sm" aria-label={t(messages, 'module.templates.apply_settings')}>
        <label>
          {t(messages, 'module.templates.target_date')}
          <span className="input-with-icon"><CalendarDays size={16} aria-hidden="true" /><input className="form-input" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></span>
        </label>
        <label>
          {t(messages, 'module.templates.shopping_list_name')}
          <input className="form-input" value={shoppingListName} onChange={(event) => setShoppingListName(event.target.value)} placeholder={t(messages, 'module.templates.shopping_list_placeholder')} />
        </label>
      </section>

      {formOpen && (
        <form className="template-editor glass" onSubmit={saveTemplate}>
          <div className="template-editor-grid">
            <label>{t(messages, 'module.templates.name_label')}<input className="form-input" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} /></label>
            <label>{t(messages, 'module.templates.description_label')}<input className="form-input" value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} /></label>
          </div>
          <div className="template-editor-grid">
            <div className="template-editor-section">
              <h3>{t(messages, 'module.templates.tasks')}</h3>
              <label>{t(messages, 'module.templates.task_title')}<input className="form-input" value={draftTask.title} onChange={(event) => setDraftTask((prev) => ({ ...prev, title: event.target.value }))} /></label>
              <label>{t(messages, 'module.templates.task_offset')}<input className="form-input" type="number" min="0" value={draftTask.days_offset} onChange={(event) => setDraftTask((prev) => ({ ...prev, days_offset: event.target.value }))} /></label>
              <button type="button" className="btn-ghost small" onClick={addTaskItem}>{t(messages, 'module.templates.add_task')}</button>
              <ul>{form.task_items.map((item, index) => <li key={`draft-task-${index}`}>{item.title}</li>)}</ul>
            </div>
            <div className="template-editor-section">
              <h3>{t(messages, 'module.templates.shopping')}</h3>
              <label>{t(messages, 'module.templates.shopping_name')}<input className="form-input" value={draftShopping.name} onChange={(event) => setDraftShopping((prev) => ({ ...prev, name: event.target.value }))} /></label>
              <label>{t(messages, 'module.templates.shopping_spec')}<input className="form-input" value={draftShopping.spec} onChange={(event) => setDraftShopping((prev) => ({ ...prev, spec: event.target.value }))} /></label>
              <button type="button" className="btn-ghost small" onClick={addShoppingItem}>{t(messages, 'module.templates.add_shopping')}</button>
              <ul>{form.shopping_items.map((item, index) => <li key={`draft-shopping-${index}`}>{item.name}{item.spec ? ` · ${item.spec}` : ''}</li>)}</ul>
            </div>
          </div>
          <div className="template-actions">
            <button className="btn-primary" type="submit">{t(messages, 'module.templates.save')}</button>
            <button className="btn-ghost" type="button" onClick={() => setFormOpen(false)}>{t(messages, 'module.templates.cancel')}</button>
          </div>
        </form>
      )}

      {loading ? <div className="glass loading-card">{t(messages, 'module.templates.loading')}</div> : (
        <>
          <section className="templates-section">
            <div className="section-title"><h2>{t(messages, 'module.templates.gallery')}</h2></div>
            <div className="templates-grid">{builtInTemplates.map(renderTemplateCard)}</div>
          </section>
          <section className="templates-section">
            <div className="section-title"><h2>{t(messages, 'module.templates.custom')}</h2></div>
            {customTemplates.length > 0 ? <div className="templates-grid">{customTemplates.map(renderTemplateCard)}</div> : <div className="empty-state glass-sm">{t(messages, 'module.templates.empty')}</div>}
          </section>
        </>
      )}
    </div>
  );
}
