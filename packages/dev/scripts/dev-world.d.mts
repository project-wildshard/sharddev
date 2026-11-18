export const DEV_RELEASE: string;
export interface DevWorld {
  readonly signed: string;
  stamp(html: string): string;
  move(product: string, slug: string): Promise<void>;
  close(): Promise<void>;
}
export function createDevWorld(origin: string, work: string): Promise<DevWorld>;
