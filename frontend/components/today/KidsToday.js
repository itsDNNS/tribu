import { useEffect, useRef, useState } from 'react';
import { Cake, Check, ChevronRight, Lightbulb } from 'lucide-react';
import { useRewards } from '../../hooks/useRewards';
import { useSwipeActions } from '../../hooks/useSwipeActions';
import { CurrencyIcon } from '../../lib/currency-icons';
import { t } from '../../lib/i18n';
import { clock, dayLabel } from '../../lib/today/todayFormat';
import SwipeReveal, { swipeStyle } from '../SwipeReveal';

const CHEER_MS = 4000;

// The next reward to save for: the cheapest one not yet in reach.
function nextReward(catalog, balance) {
  const active = (catalog || []).filter((reward) => reward.is_active && reward.cost > 0);
  return active.filter((reward) => reward.cost > balance).sort((a, b) => a.cost - b.cost)[0] || null;
}

function Stars({ rw, messages, onOpen }) {
  if (rw.loading || !rw.currency || !rw.myBalance) return null;
  const balance = rw.myBalance.balance;
  const goal = nextReward(rw.catalog, balance);
  return (
    <button type="button" className="kids-stars" onClick={onOpen}>
      <span className="kids-stars-icon" aria-hidden="true">
        <CurrencyIcon icon={rw.currency.icon} label={rw.currency.name} />
      </span>
      <span className="kids-stars-copy">
        <span className="kids-stars-count">
          <strong>{balance}</strong> {rw.currency.name}
        </span>
        {goal && (
          <>
            <span className="kids-stars-goal">
              {t(messages, 'family.goal').replace('{count}', goal.cost - balance).replace('{reward}', goal.name)}
            </span>
            <span
              className="kids-stars-bar"
              role="progressbar"
              aria-label={goal.name}
              aria-valuemin={0}
              aria-valuemax={goal.cost}
              aria-valuenow={Math.max(0, balance)}
            >
              <span style={{ width: `${Math.max(0, Math.min(100, (balance / goal.cost) * 100))}%` }} />
            </span>
          </>
        )}
      </span>
      <ChevronRight size={20} aria-hidden="true" />
    </button>
  );
}

function KidsRow({ item, task, timeLabel, ctx, onDone }) {
  const { messages, locale, timeFormat, canComplete, currencyName, currencyIcon } = ctx;
  const allowed = item.kind === 'task' && Boolean(task) && canComplete(task);
  // Swipe right to finish, as on the grown-ups' Today (N-4).
  const swipeable = allowed && !item.done;
  const { offset, handlers } = useSwipeActions({
    enabled: swipeable,
    onSwipeRight: swipeable ? () => onDone(task, false) : undefined,
  });
  const title = item.kind === 'birthday'
    ? t(messages, 'module.today.birthday').replace('{name}', item.title)
    : item.title;
  const reward = Number(task?.token_reward_amount) || 0;
  const time = timeLabel
    || (item.time ? clock(item.time, locale, timeFormat) : item.kind === 'event' ? t(messages, 'module.capture.all_day') : '');
  if (item.kind === 'task') {
    const row = (
      <div className={`kids-row kids-row-task${item.done ? ' done' : ''}${swipeable ? ' swipe-slide' : ''}`} style={swipeStyle(offset)} {...(swipeable ? handlers : {})}>
        <button
          type="button"
          role="checkbox"
          aria-checked={item.done}
          className="kids-check"
          aria-label={t(messages, 'aria.mark_task').replace('{title}', item.title)}
          disabled={!allowed}
          onClick={() => allowed && onDone(task, item.done)}
        >
          {item.done && <Check size={20} aria-hidden="true" />}
        </button>
        <span className="kids-row-copy">
          <span className="kids-row-title">{title}</span>
          {time && <span className="kids-row-time">{time}</span>}
        </span>
        {reward > 0 && !item.done && (
          <span className="kids-row-reward" aria-label={`+${reward} ${currencyName || ''}`.trim()}>
            +{reward}
            {currencyIcon && <CurrencyIcon icon={currencyIcon} />}
          </span>
        )}
      </div>
    );
    if (!swipeable) return <li>{row}</li>;
    return (
      <li className="swipe-shell">
        <SwipeReveal offset={offset} right={{ icon: <Check size={18} />, label: t(messages, 'module.tasks.done'), tone: 'success' }} />
        {row}
      </li>
    );
  }
  return (
    <li className={`kids-row kids-row-${item.kind}`}>
      <span className="kids-row-mark" aria-hidden="true">
        {item.kind === 'birthday' ? <Cake size={20} /> : <span className="kids-row-dot" />}
      </span>
      <span className="kids-row-copy">
        <span className="kids-row-title">{title}</span>
        {time && <span className="kids-row-time">{time}</span>}
      </span>
    </li>
  );
}

// Today for children (Tribu 2.0, F5): only their own day, larger, their
// stars and a way to suggest something. Ticking off cheers them on.
export default function KidsToday({
  day, tasksById, toggleTask, canComplete, name, now, locale, timeFormat, messages,
  showRewards, onOpenRewards, onSuggest,
}) {
  const [cheer, setCheer] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const rw = useRewards();
  const currencyName = rw.currency?.name || '';

  const onDone = (task, done) => {
    toggleTask(task);
    if (done) return;
    navigator.vibrate?.(15);
    clearTimeout(timer.current);
    const reward = Number(task.token_reward_amount) || 0;
    setCheer({
      id: task.id,
      reward,
      pending: Boolean(task.token_require_confirmation),
    });
    timer.current = setTimeout(() => setCheer(null), CHEER_MS);
  };
  const ctx = { messages, locale, timeFormat, canComplete, currencyName, currencyIcon: rw.currency?.icon };
  const today = day.today.filter((item) => item.kind !== 'meal');
  const earned = cheer?.reward > 0
    ? t(messages, cheer.pending ? 'module.kids.earned_pending' : 'module.kids.earned')
      .replace('{amount}', cheer.reward)
      .replace('{currency}', currencyName)
    : '';

  return (
    <div className="today-page kids-today">
      <header className="today-head">
        <div>
          <h1>{t(messages, 'module.kids.hello').replace('{name}', name)}</h1>
          <p>{now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      <div className="kids-main">
        {showRewards && <Stars rw={rw} messages={messages} onOpen={onOpenRewards} />}

        <div className="kids-cheer-slot" aria-live="polite">
          {cheer && (
            <p key={cheer.id} className="kids-cheer">
              <strong>{t(messages, 'module.kids.cheer')}</strong>
              {earned && <span>{earned}</span>}
            </p>
          )}
        </div>

        <section className="kids-day" aria-labelledby="kids-day-title">
          <h2 id="kids-day-title" className="today-section-title">{t(messages, 'module.kids.your_day')}</h2>
          {today.length > 0 ? (
            <ol className="kids-list">
              {today.map((item) => (
                <KidsRow
                  key={`${item.kind}-${item.id ?? item.title}-${item.time ?? ''}`}
                  item={item}
                  task={item.kind === 'task' ? tasksById.get(item.id) : null}
                  ctx={ctx}
                  onDone={onDone}
                />
              ))}
            </ol>
          ) : (
            <p className="kids-empty">{t(messages, 'module.kids.empty')}</p>
          )}
        </section>

        {day.overdue.length > 0 && (
          <section className="kids-day" aria-labelledby="kids-overdue-title">
            <h2 id="kids-overdue-title" className="today-section-title">{t(messages, 'module.kids.still_to_do')}</h2>
            <ol className="kids-list">
              {day.overdue.map((item) => {
                const label = dayLabel(item.date, locale);
                return (
                  <KidsRow
                    key={`overdue-${item.id}`}
                    item={{ ...item, time: null }}
                    task={tasksById.get(item.id)}
                    timeLabel={`${label.weekday} ${label.date}`}
                    ctx={ctx}
                    onDone={onDone}
                  />
                );
              })}
            </ol>
          </section>
        )}

        {typeof onSuggest === 'function' && (
          <button type="button" className="kids-suggest" onClick={onSuggest}>
            <Lightbulb size={20} aria-hidden="true" />
            {t(messages, 'module.capture.suggest_title')}
          </button>
        )}
      </div>
    </div>
  );
}
