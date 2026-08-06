export type ResolvedAsset =
  | { type: 'url'; url: string; disposable: false }
  | { type: 'object-url'; url: string; disposable: true }
  | { type: 'unavailable'; reason: string };

export interface DocumentResourceResolver {
  resolveAsset(href: string): Promise<ResolvedAsset>;
  dispose(): void;
}
