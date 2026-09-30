import {
  Bike, BookOpen, Cake, Clock, FerrisWheel, Film, Gamepad2, Gem, Gift, Heart, IceCreamCone,
  Minus, Moon, Music, Palette, Pizza, Plus, Sparkles, Star, TentTree, Trophy, Tv,
} from 'lucide-react';
import { CurrencyIcon } from '../../lib/currency-icons';

const WISH_ICON_COMPONENTS = {
  gift: Gift, film: Film, icecream: IceCreamCone, game: Gamepad2, pizza: Pizza, book: BookOpen,
  tent: TentTree, ferris: FerrisWheel, bike: Bike, palette: Palette, music: Music, tv: Tv,
  cake: Cake, moon: Moon, clock: Clock, sparkles: Sparkles, star: Star, trophy: Trophy, heart: Heart, gem: Gem,
};

/** A wish's picture: one of the icons, or the emoji older wishes carry. */
export function WishIcon({ icon, size = 20 }) {
  const Icon = WISH_ICON_COMPONENTS[icon];
  if (Icon) return <Icon size={size} aria-hidden="true" />;
  if (icon) return <span className="rewards-wish-emoji" aria-hidden="true">{icon}</span>;
  return <Gift size={size} aria-hidden="true" />;
}

/** "12 ★" with the family's star icon; the name is read out, not shown. */
export function Stars({ currency, name, amount, sign = '' }) {
  return (
    <span className="rewards-stars">
      {sign}{amount}
      <CurrencyIcon icon={currency?.icon || 'star'} label={name} />
    </span>
  );
}

/** A soft progress bar; `color` tints the fill. */
export function Progress({ value, color, label, max, now }) {
  return (
    <span
      className="rewards-bar"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={now}
      style={color ? { '--bar-color': color } : undefined}
    >
      <span className="rewards-bar-fill" style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }} />
    </span>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="rewards-section-head">
      <h2 className="rewards-section-title">{children}</h2>
      {action}
    </div>
  );
}

/** A number with − and + beside it. */
export function Stepper({ value, onChange, min = 0, max = 999, label, decrease, increase }) {
  const clamp = (next) => Math.max(min, Math.min(max, Number.isFinite(next) ? next : min));
  return (
    <div className="rewards-stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(clamp(value - 1))} disabled={value <= min} aria-label={decrease}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10)))}
        aria-label={label}
      />
      <button type="button" onClick={() => onChange(clamp(value + 1))} disabled={value >= max} aria-label={increase}>
        <Plus size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
