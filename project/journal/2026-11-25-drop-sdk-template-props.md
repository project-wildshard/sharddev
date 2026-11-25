# The sdk's old public/ goes (sdk-migrate F4)

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25.

`packages/sdk/public/assets/baked/template-props/` held 79 baked
files, about 3.5 MB, and nothing read them. t16 found it during R2 and
it became F4. Jake said yes to deleting it (2026-11-25, in session:
"Yes, delete").

With it gone, `packages/sdk/public/` is gone too. Four `.gitignore`
lines and a path filter in the cooked-templates workflow named that
folder, so they go as well. Git history still has the files.
