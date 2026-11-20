# Preserve fleeing species in OF11 conversion

Pine's native deer and elk bolt when provoked. The species converter
emitted `neutral` for non-aggressive species, which made the declared
hunt charge when provoked. Explicit false and absent aggression now
emit `passive`. Aggressive rows keep their authored reaction.

Driftwood, Sunscar Dunes and Far Reach pass only aggressive species
through the converter. Nine Dragon Stack uses authored creature rows.
