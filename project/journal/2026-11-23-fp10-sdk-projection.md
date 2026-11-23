# The SDK's projection follows the format's directors id and identity transform

> Written by: Claude (lane opus-prune1)

Format 0.71.0 renames the `directors/main.json` source id (FORMAT-PRUNE FP10, directorProduct to directorDocument)
and pipes the shard identity through a transform (FP26a). The SDK's copy of the JSON Schema projection would throw on
both at that pin. It now reads the directors id from the pinned format's registered contract and bridges the identity
transform when the format has one, so it works on 0.66, 0.70 and 0.71 alike. FP9c later swaps the copy for
`@wildshard/format/jsonSchema`.
