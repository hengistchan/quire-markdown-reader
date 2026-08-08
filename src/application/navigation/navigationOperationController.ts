const NAVIGATION_SUPERSEDED = 'The navigation operation was superseded.';

export class NavigationOperationController {
  private current?: AbortController;

  begin(): AbortSignal {
    this.cancel();
    const operation = new AbortController();
    this.current = operation;
    return operation.signal;
  }

  cancel(): void {
    this.current?.abort(new DOMException(NAVIGATION_SUPERSEDED, 'AbortError'));
    this.current = undefined;
  }
}
