// What a swipe on a row will do, shown behind the row while it moves
// (`useSwipeActions`). `right` shows on a swipe to the right, `left` on a
// swipe to the left; each is { icon, label, tone }.
export default function SwipeReveal({ offset, right, left }) {
  return (
    <div className="swipe-reveal" aria-hidden="true">
      {right && (
        <span className={`swipe-reveal-${right.tone}${offset > 0 ? ' visible' : ''}`}>
          {right.icon}{right.label}
        </span>
      )}
      {left && (
        <span className={`swipe-reveal-end swipe-reveal-${left.tone}${offset < 0 ? ' visible' : ''}`}>
          {left.label}{left.icon}
        </span>
      )}
    </div>
  );
}

export function swipeStyle(offset) {
  return offset ? { transform: `translateX(${offset}px)`, transition: 'none' } : undefined;
}
