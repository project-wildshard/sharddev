# Tests read Template 2 from the pin

- `src/test/fixtures/product` was a copy of shardfile v0.1.0's fixture,
  kept only because no tag shipped a real shard. v0.4.2 ships
  `corpus/handwritten`, so `shardfileFiles` reads that and the copy is
  gone. A format move now reaches these tests through the pin.
- Template 2 is 15 times the fixture's size. The pack and upload tests
  went from 0.7 s to 1.4 s, a fair trade for a real shard.
- `www.wildshard.io` stays on v0.3.1: a push to its `package.json` runs
  `site-deploy`, and this lane moves nothing live.
