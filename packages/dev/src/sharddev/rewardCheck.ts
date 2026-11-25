// FORMAT-PRUNE FP56 (QA 11-16 mini row 46, friction F32): a `catalogue` ledger reward outside the platform catalogue
// policy refused Honeyknoll at load ("Reward is outside the platform catalogue policy", engine `admitLedgerRewards`) while
// `wildshard check` passed it. Check now reads the API's platform catalogue (GET /api/items.json) and refuses each such
// reward before upload, naming it. The rule is the engine's: the item is listed, its tier is at most the item's
// `maxTier`, and its quantity is the platform's (one; items.json names no other). No answer is never a refusal: the
// step warns that catalogue rewards went unchecked.
import * as v from 'valibot';
import type { AdmissionApi } from './admissionLine';

/** One catalogue reward a shard's ledger names. */
export interface CatalogueReward { readonly fact: string; readonly item: string; readonly tier: number; readonly quantity: number }
/** api-server's /api/items.json: the platform items and the highest tier a shard may grant of each. */
const ItemsSchema = v.object({ version: v.literal(1), items: v.array(v.object({ id: v.string(), maxTier: v.number() })) });
type PlatformItems = v.InferOutput<typeof ItemsSchema>['items'];
const TIMEOUT_MS = 10_000;

/** Every catalogue reward in a ledger's rules (format `LedgerRulesSchema` rows). */
export function catalogueRewards(ledger: unknown): CatalogueReward[] {
  if (!Array.isArray(ledger)) return [];
  const out: CatalogueReward[] = [];
  for (const rule of ledger as readonly { fact?: unknown; rewards?: unknown }[]) {
    if (typeof rule !== 'object' || rule === null || !Array.isArray(rule.rewards)) continue;
    for (const reward of rule.rewards as readonly Record<string, unknown>[]) {
      if (reward['kind'] !== 'catalogue') continue;
      out.push({ fact: String(rule.fact), item: String(reward['item']), tier: Number(reward['tier']), quantity: Number(reward['quantity']) });
    }
  }
  return out;
}

/** The refusal for each reward the engine's `admitLedgerRewards` would refuse at load, naming the fact and the reward. */
export function catalogueRewardRefusals(rewards: readonly CatalogueReward[], items: PlatformItems): string[] {
  const listed = new Map(items.map(item => [item.id, item]));
  return rewards.flatMap(reward => {
    const item = listed.get(reward.item), named = `ledger fact ${reward.fact}: catalogue reward ${reward.item} (tier ${reward.tier}, quantity ${reward.quantity})`;
    if (item === undefined) return [`${named} is not in the platform catalogue (${items.length} items listed); the engine refuses the whole shard at load`];
    if (reward.tier > item.maxTier) return [`${named} is over the platform's tier ${item.maxTier} for it; the engine refuses the whole shard at load`];
    if (reward.quantity !== 1) return [`${named} grants ${reward.quantity}, the platform grants 1; the engine refuses the whole shard at load`];
    return [];
  });
}

/** The API's platform items, or undefined when it does not answer. */
export async function platformItems(api: AdmissionApi): Promise<PlatformItems | undefined> {
  try {
    const reply = await (api.fetch ?? fetch)(new URL('/api/items.json', api.server), { signal: AbortSignal.timeout(api.timeoutMs ?? TIMEOUT_MS) });
    if (!reply.ok) return undefined;
    const read = v.safeParse(ItemsSchema, await reply.json() as unknown);
    return read.success ? read.output.items : undefined;
  } catch { return undefined; }
}

/** Check's verdict on a ledger's catalogue rewards: refusals, or a warning when the API did not answer. */
export async function rewardCheck(ledger: unknown, api: AdmissionApi | undefined): Promise<{ refusals: string[]; warnings: string[] }> {
  const rewards = catalogueRewards(ledger);
  if (rewards.length === 0) return { refusals: [], warnings: [] };
  const items = api === undefined ? undefined : await platformItems(api);
  if (items === undefined) return { refusals: [], warnings: [`${rewards.length} catalogue reward${rewards.length === 1 ? '' : 's'} unchecked: the API's platform catalogue (/api/items.json) did not answer`] };
  return { refusals: catalogueRewardRefusals(rewards, items), warnings: [] };
}
