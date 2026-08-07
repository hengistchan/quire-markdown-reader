import { useEffect, useReducer } from 'react';
import {
  createWelcomeSession, documentSessionReducer, documentSourceUrl, type DocumentSession,
} from '../../../domain/documentSession';
import type { Translator } from '../../../shared/i18n';

export function useReaderSession(t: Translator) {
  const [session, dispatch] = useReducer(
    documentSessionReducer,
    undefined,
    () => createWelcomeSession(t('welcomeDocumentTitle'), t('welcomeDocument')),
  );
  const sourceUrl = documentSourceUrl(session);
  const documentFormat = session.kind === 'imported' ? session.format : 'markdown';
  const remoteState = session.kind === 'remote' ? session.state : undefined;
  const workspace = session.kind === 'workspace' ? session.workspace : undefined;
  const activeFile = session.kind === 'workspace' || session.kind === 'file' ? session.file : undefined;

  useEffect(() => {
    if (session.kind !== 'welcome') return;
    dispatch({ type: 'localize-welcome', title: t('welcomeDocumentTitle'), markdown: t('welcomeDocument') });
  }, [session.kind, t]);

  return {
    session,
    dispatch,
    replace: (next: DocumentSession) => dispatch({ type: 'replace', session: next }),
    title: session.title,
    source: session.markdown,
    sourceUrl,
    documentFormat,
    remoteState,
    workspace,
    activeFile,
  };
}
