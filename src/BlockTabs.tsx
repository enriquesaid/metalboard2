import type { ReactNode } from 'react';

type Tab<Key extends string> = { id: Key; label: ReactNode };

export function BlockTabs<Key extends string>({ className, id, label, value, tabs, onChange }: {
  className: string;
  id: string;
  label: string;
  value: Key;
  tabs: ReadonlyArray<Tab<Key>>;
  onChange: (key: Key) => void;
}) {
  return <div className={className} role="tablist" aria-label={label}>
    {tabs.map((tab, index) => <button
      key={tab.id}
      type="button"
      role="tab"
      id={`${id}-${tab.id}`}
      aria-selected={tab.id === value}
      aria-controls={`${id}-panel`}
      tabIndex={tab.id === value ? 0 : -1}
      className={tab.id === value ? 'selected' : undefined}
      onClick={() => onChange(tab.id)}
      onKeyDown={event => {
        const { key, currentTarget } = event;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
        event.preventDefault();
        const next = key === 'Home' ? 0 : key === 'End' ? tabs.length - 1 : (index + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        onChange(tabs[next].id);
        (currentTarget.parentElement?.children[next] as HTMLButtonElement | undefined)?.focus();
      }}
    >{tab.label}</button>)}
  </div>;
}
