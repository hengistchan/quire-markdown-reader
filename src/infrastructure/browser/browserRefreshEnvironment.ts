import type { Disposable, RefreshEnvironment } from '../../application/refresh/refreshScheduler';

function listen(target: EventTarget, type: string, listener: () => void): Disposable {
  target.addEventListener(type, listener);
  return { dispose: () => target.removeEventListener(type, listener) };
}

export class BrowserRefreshEnvironment implements RefreshEnvironment {
  isVisible(): boolean {
    return !document.hidden;
  }

  isOnline(): boolean {
    return navigator.onLine;
  }

  onVisibilityChange(listener: () => void): Disposable {
    return listen(document, 'visibilitychange', listener);
  }

  onOnlineChange(listener: () => void): Disposable {
    const online = listen(window, 'online', listener);
    const offline = listen(window, 'offline', listener);
    return { dispose: () => { online.dispose(); offline.dispose(); } };
  }
}
