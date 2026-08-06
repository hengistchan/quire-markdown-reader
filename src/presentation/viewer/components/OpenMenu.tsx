import { FilePlus2, FolderOpen, Globe2 } from 'lucide-react';
import type { ShortcutLabels } from '../../../core/shortcuts';
import type { Translator } from './types';

export function OpenMenu({ t, shortcuts, onFile, onFolder, onUrl }: {
  t: Translator;
  shortcuts: ShortcutLabels;
  onFile: () => void;
  onFolder: () => void;
  onUrl: () => void;
}) {
  return <div className="popover-menu open-menu">
    <label>{t('openContent')}</label>
    <button onClick={onFile}><FilePlus2 /><span><strong>{t('openFile')}</strong><small>.md · .markdown · .mdx</small></span><kbd>{shortcuts.openFile}</kbd></button>
    <button onClick={onFolder}><FolderOpen /><span><strong>{t('openFolder')}</strong><small>{t('workspace')}</small></span><kbd>{shortcuts.openFolder}</kbd></button>
    <button onClick={onUrl}><Globe2 /><span><strong>{t('openUrl')}</strong><small>HTTP / HTTPS</small></span><kbd>{shortcuts.openUrl}</kbd></button>
  </div>;
}
