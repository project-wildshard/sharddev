# The GLB bake reads three's flags, not instanceof (SF7c)

Nine Dragon's pre-stage on a locally linked SDK 0.9.0 refused in the
build: "GLB textures must be external KTX2 declarations". Nine set no
texture. Its generators and the linked SDK each resolved their own copy
of three 0.186.0, so Nine's MeshBasicMaterial failed the bake's
`instanceof MeshBasicMaterial`, and its absent PBR maps (undefined, not
null) read as textures. With two copies an unlit material would also
have been written lit.

`staticGlb` now asks `isMeshBasicMaterial` (`unlit`) and treats a map
as present only when it is set (`hasTexture`). The refusal says what
J525 says: a GLB texture is a separate image declaration and the cook
encodes it. A same-copy bake writes the same bytes as before.
