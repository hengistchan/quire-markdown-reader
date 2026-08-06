import type { ReaderController } from '../../application/reader/readerController';
import { ReaderView } from './ReaderView';
import { useReaderController } from './hooks/useReaderController';

export interface ReaderPageProps {
  controller: ReaderController;
}

export function ReaderPage({ controller }: ReaderPageProps) {
  return <ReaderView view={useReaderController(controller)} />;
}
