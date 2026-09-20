import { ArrowRight, Refrigerator } from 'lucide-react';
import { t } from '../lib/i18n';
import { MEAL_SLOTS } from '../lib/meal-plans';
import { DashboardCardHeading } from './DashboardDetails';

export default function DashboardMealsCard({ meals, loading, error, messages, setActiveView }) {
  const openMeals = () => setActiveView('meal_plans');
  return (
    <section className="bento-card bento-meals" aria-label={t(messages, 'module.dashboard.daily_loop_meals')}>
      <DashboardCardHeading title={t(messages, 'module.dashboard.meals_title')} icon={Refrigerator} tone="green" action={t(messages, 'module.rewards.view_all')} onClick={openMeals} />
      {loading ? <p role="status" className="bento-empty">{t(messages, 'module.meal_plans.loading')}</p>
        : error ? <p role="alert" className="quick-capture-error">{t(messages, 'toast.error')}</p>
          : <div className="dashboard-meal-list">
            {MEAL_SLOTS.map((slot) => {
              const planned = meals.filter((meal) => meal.slot === slot);
              return (
                <button type="button" key={slot} className={`dashboard-meal-row dashboard-meal-${slot}`} onClick={openMeals}>
                  <span className="dashboard-meal-icon" aria-hidden="true"><img src={`/illustrations/meal-${{ morning: 'breakfast', noon: 'lunch', evening: 'dinner' }[slot]}.jpg`} alt="" /></span>
                  <span>
                    <span className="dashboard-meal-slot">{t(messages, `module.meal_plans.slot.${slot}`)}</span>
                    <span className="dashboard-meal-name">{planned.length ? planned.map((meal) => meal.meal_name).join(' · ') : t(messages, 'module.weekly_plan.empty_section')}</span>
                  </span>
                </button>
              );
            })}
          </div>}
      <div className="bento-card-footer">
        <button type="button" className="bento-card-action" onClick={openMeals}>
          {t(messages, 'module.dashboard.daily_loop_open_meals')} <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
