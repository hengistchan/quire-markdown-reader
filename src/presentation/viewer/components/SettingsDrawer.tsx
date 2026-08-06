import { ChevronRight, Moon, ShieldCheck, Sun, X } from 'lucide-react';
import type { ReaderSettings } from '../../../shared/types';
import type { Translator } from './types';

export function SettingsDrawer({ settings, t, onChange, onReset, onClose }: {
  settings: ReaderSettings;
  t: Translator;
  onChange: (patch: Partial<ReaderSettings>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="settings-drawer" onMouseDown={(event) => event.stopPropagation()} aria-label={t('settings')}>
      <div className="drawer-title"><div><h2>{t('settings')}</h2><p>{t('settingsLive')}</p></div><button className="icon-button" onClick={onClose} aria-label={t('closeSettings')}><X /></button></div>
      <section>
        <label className="section-label">{t('appearance')}</label><strong className="control-label">{t('system')}</strong>
        <div className="segmented">{(['light', 'dark', 'system'] as const).map((theme) => <button key={theme} className={settings.theme === theme ? 'active' : ''} onClick={() => onChange({ theme })}>{theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <span className="system-icon" />} {t(theme)}</button>)}</div>
        <div className="font-choice"><button className={settings.fontFamily === 'serif' ? 'active' : ''} onClick={() => onChange({ fontFamily: 'serif' })}><strong>{t('serif')}</strong><span>Aa</span></button><button className={settings.fontFamily === 'sans' ? 'active' : ''} onClick={() => onChange({ fontFamily: 'sans' })}><strong>{t('sans')}</strong><span>Aa</span></button></div>
        <RangeSetting label={t('textSize')} value={settings.fontSize} min={15} max={24} suffix=" px" onChange={(fontSize) => onChange({ fontSize })} />
        <RangeSetting label={t('pageWidth')} value={settings.contentWidth} min={560} max={980} step={10} suffix=" px" onChange={(contentWidth) => onChange({ contentWidth })} />
        <RangeSetting label={t('lineHeight')} value={settings.lineHeight} min={1.45} max={2} step={0.01} onChange={(lineHeight) => onChange({ lineHeight })} />
        <div className="setting-row"><div><strong>{t('language')}</strong><span>English / 简体中文</span></div><select aria-label={t('language')} value={settings.locale} onChange={(event) => onChange({ locale: event.target.value as ReaderSettings['locale'] })}><option value="system">{t('system')}</option><option value="en">English</option><option value="zh-CN">简体中文</option></select></div>
      </section>
      <section><label className="section-label">{t('readingAids')}</label><Toggle label={t('readingProgress')} description={t('progressDescription')} checked={settings.showReadingProgress} onChange={(showReadingProgress) => onChange({ showReadingProgress })} /><Toggle label={t('autoRefresh')} description={t('refreshDescription')} checked={settings.autoRefresh} onChange={(autoRefresh) => onChange({ autoRefresh })} /><Toggle label={t('floatingOutline')} description={t('outlineDescription')} checked={settings.showOutline} onChange={(showOutline) => onChange({ showOutline })} /></section>
      <details className="settings-group"><summary><span><strong>{t('markdownExtensions')}</strong><small>KaTeX · Mermaid · HTML</small></span><ChevronRight /></summary><div><Toggle label={t('mathematics')} description={t('mathDescription')} checked={settings.enableKatex} onChange={(enableKatex) => onChange({ enableKatex })} /><Toggle label={t('diagrams')} description={t('diagramDescription')} checked={settings.enableMermaid} onChange={(enableMermaid) => onChange({ enableMermaid })} /><Toggle label={t('rawHtml')} description={t('htmlDescription')} checked={settings.enableHtml} onChange={(enableHtml) => onChange({ enableHtml })} /></div></details>
      <details className="settings-group"><summary><span><strong>{t('advanced')}</strong><small>{t('customCss')}</small></span><ChevronRight /></summary><div><Toggle label={t('loadRemoteImages')} description={t('remoteImagesDescription')} checked={settings.loadRemoteImages} onChange={(loadRemoteImages) => onChange({ loadRemoteImages })} /><div className="setting-row"><div><strong>{t('imageReferrerPolicy')}</strong></div><select aria-label={t('imageReferrerPolicy')} value={settings.remoteImageReferrerPolicy} onChange={(event) => onChange({ remoteImageReferrerPolicy: event.target.value as ReaderSettings['remoteImageReferrerPolicy'] })}><option value="no-referrer">{t('noReferrer')}</option><option value="origin">{t('originReferrer')}</option></select></div><label className="section-label" htmlFor="custom-css">{t('customCss')}</label><textarea id="custom-css" value={settings.customCss} onChange={(event) => onChange({ customCss: event.target.value })} placeholder={'.markdown-body h2 {\n  color: rebeccapurple;\n}'} /><p className="setting-note">{t('cssNote')}</p></div></details>
      <div className="settings-footer"><button onClick={onReset}>{t('resetSettings')}</button><span><ShieldCheck />{t('savedLocally')}</span></div>
    </aside>
  </div>;
}

function RangeSetting({ label, value, min, max, step = 1, suffix = '', onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return <div className="range-setting"><div><strong>{label}</strong><output>{value}{suffix}</output></div><input aria-label={label} type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></div>;
}

function Toggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className="toggle-row"><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}
