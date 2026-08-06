import { useMemo } from 'react';
import { ReaderPage } from '../../presentation/viewer/ReaderPage';
import { createReaderController } from './composition';

export function App() {
  const controller = useMemo(() => createReaderController(), []);
  return <ReaderPage controller={controller} />;
}
