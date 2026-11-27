# Keep the SDK's engine and its clients on the same release

The SDK parity oracle and the author tools now use the same engine
prerelease. The dev package maps the npm pin to the full staging SHA so
dev and prepare fetch the clients J475 published for that engine. The
pin test checks that mapping against the installed package's gitHead.
