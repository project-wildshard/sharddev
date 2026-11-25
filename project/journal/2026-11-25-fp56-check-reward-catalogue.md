# FP56: check refuses catalogue rewards the platform refuses

Honeyknoll passed `wildshard check` and then the engine refused the whole shard at load: a catalogue ledger reward was
outside the platform catalogue (staging's /api/items.json listed none). The engine's rule (`admitLedgerRewards`) needs
the platform list, which only the API has, so check's validate step now reads `/api/items.json` and refuses each reward
the engine would (unlisted item, tier over its max, quantity other than one), naming the fact. Offline it warns.
