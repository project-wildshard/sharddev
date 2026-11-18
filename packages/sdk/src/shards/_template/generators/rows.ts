import compendiums from '../data/rows/compendiums.json' with { type: 'json' };
import days from '../data/rows/days.json' with { type: 'json' };
import looks from '../data/rows/looks.json' with { type: 'json' };
import loot from '../data/rows/loot.json' with { type: 'json' };
import species from '../data/rows/species.json' with { type: 'json' };
import strikes from '../data/rows/strikes.json' with { type: 'json' };
import weather from '../data/rows/weather.json' with { type: 'json' };

/** SHARD-SOURCE AP36b: the shardfile's `rows` section, one file per row kind under data/rows/ (Brasscap's layout), joined
 * here in the section's order. The skin looks the product writes come from data/skins.json; data/rows/looks.json is what
 * the boss compile sees. */
export const TEMPLATE_RAW_ROWS = { strikes, weather, days, species, looks, compendiums, loot };
