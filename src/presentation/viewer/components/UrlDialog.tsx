import { Globe2, LoaderCircle } from 'lucide-react';
import type { Translator } from './types';

export function UrlDialog({ value, loading, t, onValue, onClose, onCancel, onOpen }: {
  value: string;
  loading: boolean;
  t: Translator;
  onValue: (value: string) => void;
  onClose: () => void;
  onCancel: () => void;
  onOpen: () => void;
}) {
  return <div className="modal-backdrop" onMouseDown={loading ? undefined : onClose}>
    <section className="url-dialog" role="dialog" aria-modal="true" aria-labelledby="url-title" aria-busy={loading} onMouseDown={(event) => event.stopPropagation()}>
      <div className="url-dialog-icon"><Globe2 /></div><h2 id="url-title">{t('urlTitle')}</h2><p>{t('urlDescription')}</p>
      <input autoFocus disabled={loading} type="url" value={value} onChange={(event) => onValue(event.target.value)} onKeyDown={(event) => !loading && event.key === 'Enter' && onOpen()} placeholder={t('urlPlaceholder')} />
      <div className="dialog-actions"><button className="quiet-button" onClick={loading ? onCancel : onClose}>{t('cancel')}</button><button className="primary-button" disabled={loading} onClick={onOpen}>{loading && <LoaderCircle className="loading-spinner" />}<span>{loading ? t('loadingRemote') : t('open')}</span></button></div>
    </section>
  </div>;
}
