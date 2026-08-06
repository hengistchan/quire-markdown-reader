import { useEffect, useRef } from 'react';
import type { HeadingItem } from '../../../shared/types';
import type { Translator } from './types';

export function OutlinePanel({ headings, activeId, progress, t, onJump }: {
  headings: HeadingItem[];
  activeId?: string;
  progress: number;
  t: Translator;
  onJump: (id: string) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLButtonElement>('.active');
    if (!nav || !active) return;
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.top < navRect.top) nav.scrollTop -= navRect.top - activeRect.top;
    else if (activeRect.bottom > navRect.bottom) nav.scrollTop += activeRect.bottom - navRect.bottom;
  }, [activeId]);
  return <>
    <nav className="outline-navigation" ref={navRef}>{headings.map((heading) => (
      <button key={heading.id} className={activeId === heading.id ? 'active' : ''} style={{ paddingInlineStart: `${10 + Math.max(0, heading.level - 1) * 8}px` }} onClick={() => onJump(heading.id)}>{heading.text}</button>
    ))}{headings.length === 0 && <p className="outline-empty">{t('noOutline')}</p>}</nav>
    <div className="outline-progress"><span>{t('readingProgress')} {Math.round(progress)}%</span><i><b style={{ width: `${progress}%` }} /></i></div>
  </>;
}
