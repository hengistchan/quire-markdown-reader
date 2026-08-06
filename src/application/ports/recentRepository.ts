export type RecentItem =
  | { id: string; title: string; kind: 'remote'; url: string; openedAt: number; scrollPosition?: number; headingId?: string }
  | { id: string; title: string; kind: 'workspace-file'; workspaceId: string; filePath: string; openedAt: number; scrollPosition?: number; headingId?: string }
  | { id: string; title: string; kind: 'local-file'; fileId: string; openedAt: number; scrollPosition?: number; headingId?: string };

export type RecentItemInput = RecentItem extends infer Item
  ? Item extends RecentItem ? Omit<Item, 'openedAt'> : never
  : never;

export interface RecentRepository {
  list(): Promise<RecentItem[]>;
  put(item: RecentItemInput): Promise<RecentItem[]>;
  updatePosition(id: string, scrollPosition: number, headingId?: string): Promise<RecentItem[]>;
}
