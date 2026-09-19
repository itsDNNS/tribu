import { useId, useState } from 'react';
import { categoryKey, categoryVocabulary } from '../lib/shoppingPresentation';

export default function ShoppingCategoryInput({ value, onChange, categories, label, placeholder }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = categoryKey(value);
  const suggestions = query ? categoryVocabulary(categories).filter((category) => categoryKey(category).includes(query)) : [];
  const visible = open && suggestions.length > 0;
  const selected = active >= 0 && active < suggestions.length ? active : -1;

  function choose(category) {
    onChange(category);
    setOpen(false);
    setActive(-1);
  }

  return (
    <div className="shopping-category-combobox">
      <input
        className="quick-add-input shopping-category-input"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={visible ? id : undefined}
        aria-activedescendant={visible && selected >= 0 ? `${id}-${selected}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
          } else if (suggestions.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault();
            setOpen(true);
            setActive(event.key === 'ArrowDown' ? (selected + 1) % suggestions.length : (selected <= 0 ? suggestions.length - 1 : selected - 1));
          } else if (event.key === 'Enter' && visible && selected >= 0) {
            event.preventDefault();
            choose(suggestions[selected]);
          }
        }}
      />
      {visible && (
        <div id={id} role="listbox" aria-label={label} className="shopping-category-options">
          {suggestions.map((category, index) => (
            <button
              id={`${id}-${index}`} key={category} type="button" role="option" tabIndex={-1}
              aria-selected={selected === index}
              onPointerDown={(event) => event.preventDefault()}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(category)}
            >{category}</button>
          ))}
        </div>
      )}
    </div>
  );
}
