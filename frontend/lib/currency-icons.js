import { Star, Gem, Heart, Zap, Trophy, Coins } from 'lucide-react';

const ICON_MAP = {
  star: Star,
  gem: Gem,
  heart: Heart,
  zap: Zap,
  trophy: Trophy,
};

export function CurrencyIcon({ icon, size = '1em', className, label }) {
  const Icon = ICON_MAP[icon] || Coins;
  return (
    <>
      <Icon size={size} className={className} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
