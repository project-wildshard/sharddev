# The build writes the level look into look/look

> Written by: Claude (opus-of9b2b), 2026-11-20

ONE-FORMAT OF9b2 (meta). Format 0.51.0 gave `look/look` a `level` field for the sky, atmosphere, grade and horizon that
OF7 left in the manifest, and engine `2752331908` reads it first. Now the build fills it: `readProjectAssets` runs the
format's `liftLevelLook` over the shard, so those four leave `ui/level` and land in `look.level` byte for byte (checked on
13 manifests across the shard repos). Discovery keeps a copy for the grid shell, which reads the level before the product
admits. `packManifestImages` no longer assumes a manifest has a `sky`. Shard repos need only a rebuild on the next SDK.
