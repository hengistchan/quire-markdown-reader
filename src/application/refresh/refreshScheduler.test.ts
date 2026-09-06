import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DefaultRefreshScheduler, type Disposable, type RefreshEnvironment } from './refreshScheduler';

class FakeEnvironment implements RefreshEnvironment {
  visible = true;
  online = true;
  private visibility = new Set<() => void>();
  private network = new Set<() => void>();

  isVisible = () => this.visible;
  isOnline = () => this.online;
  onVisibilityChange = (listener: () => void): Disposable => this.add(this.visibility, listener);
  onOnlineChange = (listener: () => void): Disposable => this.add(this.network, listener);
  changeVisibility(visible: boolean) {
    this.visible = visible;
    for (const listener of this.visibility) listener();
  }
  changeOnline(online: boolean) {
    this.online = online;
    for (const listener of this.network) listener();
  }
  private add(target: Set<() => void>, listener: () => void): Disposable {
    target.add(listener);
    return { dispose: () => target.delete(listener) };
  }
}

describe('DefaultRefreshScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('checks a visible local source every 2500ms and immediately when visibility returns', async () => {
    const environment = new FakeEnvironment();
    const run = vi.fn(async () => undefined);
    const disposable = new DefaultRefreshScheduler(environment).start({ kind: 'local', run });

    await vi.advanceTimersByTimeAsync(2_500);
    expect(run).toHaveBeenCalledTimes(1);
    environment.changeVisibility(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(1);
    environment.changeVisibility(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    disposable.dispose();
  });

  it('pauses remote refresh offline, resumes immediately, and backs off after failures', async () => {
    const environment = new FakeEnvironment();
    const run = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValue(undefined);
    const disposable = new DefaultRefreshScheduler(environment).start({ kind: 'remote', run });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(run).toHaveBeenCalledTimes(1);
    environment.changeOnline(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    environment.changeOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    disposable.dispose();
  });
});
