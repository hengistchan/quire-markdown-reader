export interface Disposable {
  dispose(): void;
}

export interface RefreshEnvironment {
  isVisible(): boolean;
  isOnline(): boolean;
  onVisibilityChange(listener: () => void): Disposable;
  onOnlineChange(listener: () => void): Disposable;
}

export interface RefreshTask {
  kind: 'local' | 'remote';
  run(signal: AbortSignal): Promise<void>;
}

export interface RefreshScheduler {
  start(task: RefreshTask): Disposable;
}

const LOCAL_INTERVAL = 2_500;
const REMOTE_INTERVAL = 30_000;
const REMOTE_MAX_INTERVAL = 5 * 60_000;

export class DefaultRefreshScheduler implements RefreshScheduler {
  constructor(private readonly environment: RefreshEnvironment) {}

  start(task: RefreshTask): Disposable {
    let disposed = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    let remoteDelay = REMOTE_INTERVAL;

    const allowed = () => this.environment.isVisible() && (task.kind === 'local' || this.environment.isOnline());
    const clearTimer = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (delay: number) => {
      clearTimer();
      if (!disposed && allowed()) timer = setTimeout(() => void run(), delay);
    };
    const run = async () => {
      if (disposed || running || !allowed()) return;
      running = true;
      request = new AbortController();
      try {
        await task.run(request.signal);
        remoteDelay = REMOTE_INTERVAL;
      } catch {
        if (task.kind === 'remote') remoteDelay = Math.min(remoteDelay * 2, REMOTE_MAX_INTERVAL);
      } finally {
        running = false;
        request = undefined;
        schedule(task.kind === 'local' ? LOCAL_INTERVAL : remoteDelay);
      }
    };
    const resume = () => {
      clearTimer();
      if (allowed()) void run();
      else request?.abort();
    };

    const visibility = this.environment.onVisibilityChange(resume);
    const online = this.environment.onOnlineChange(() => {
      if (task.kind === 'remote') resume();
    });
    schedule(task.kind === 'local' ? LOCAL_INTERVAL : REMOTE_INTERVAL);

    return {
      dispose() {
        disposed = true;
        clearTimer();
        request?.abort();
        visibility.dispose();
        online.dispose();
      },
    };
  }
}
