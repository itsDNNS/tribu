import { useId, useState } from 'react';
import { Send } from 'lucide-react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { apiCreateQuickCapture } from '../../lib/api';
import { t } from '../../lib/i18n';
import BottomSheet from './BottomSheet';

// "+" for children (Tribu 2.0, E5): they suggest, an adult confirms. Each
// line becomes one suggestion in the family's inbox.
export default function SuggestSheet({ onClose, initialText = '' }) {
  const { messages, familyId, demoMode } = useApp();
  const toast = useToast();
  const [text, setText] = useState(initialText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hintId = useId();
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  const submit = async () => {
    if (!lines.length || busy || !familyId || demoMode) return;
    setBusy(true);
    setError('');
    const failed = [];
    for (const line of lines) {
      const result = await apiCreateQuickCapture({ family_id: Number(familyId), text: line, destination: 'inbox' });
      if (!result?.ok) failed.push(line);
    }
    setBusy(false);
    if (failed.length) {
      setText(failed.join('\n'));
      setError(t(messages, 'module.capture.partial').replace('{count}', failed.length));
      return;
    }
    toast.success(t(messages, 'module.capture.suggest_sent'));
    onClose();
  };

  return (
    <BottomSheet title={t(messages, 'module.capture.suggest_title')} messages={messages} onClose={onClose} className="ui-new-sheet">
      <section className="capture">
        <p id={hintId} className="capture-hint">{t(messages, 'module.capture.suggest_hint')}</p>
        <textarea
          className="capture-input"
          value={text}
          rows={3}
          maxLength={1000}
          placeholder={t(messages, 'module.capture.suggest_placeholder')}
          aria-label={t(messages, 'module.capture.suggest_title')}
          aria-describedby={hintId}
          onChange={(event) => {
            setText(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {error && <p className="capture-error" role="alert">{error}</p>}
        <button type="button" className="capture-submit" disabled={!lines.length || busy || demoMode} onClick={submit}>
          <Send size={16} aria-hidden="true" />
          {t(messages, 'module.capture.suggest_send')}
        </button>
      </section>
    </BottomSheet>
  );
}
