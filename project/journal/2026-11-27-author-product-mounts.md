# Serve authored mounts from the built product

The SDK 0.9.2 browser proof reached the new scaffold's local score.
Watch returned 404 because the server only looked for the request path
in the output tree. Use cook.json's URL-to-member map for dev and watch.
Both now serve the encoded bytes, including mounts backed by a blob.
