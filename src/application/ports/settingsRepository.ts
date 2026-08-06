import type { ReaderSettings } from '../../shared/types';

export interface SettingsRepository {
  load(): Promise<ReaderSettings>;
  save(settings: ReaderSettings): Promise<void>;
}
