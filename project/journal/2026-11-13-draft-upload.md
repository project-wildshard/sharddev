# 2026-11-13: upload refuses an unprepared draft

- Meta QA-FEEDBACK 11-13 row 2 (lane opus-prepcheck): a fresh build writes
  `sdk: "0.2"`, a draft; only `wildshard prepare` (J198) writes `0.3`, and
  api-server answers a draft 422 at commit (J259) after the whole upload.
  `upload` now refuses a draft before any request (rule `shardfile-draft`);
  `build` and `check` warn (check's verdict document gains `warnings`); the
  help stops saying build checks "as api-server will"; dev.md says build,
  prepare, upload.
- Upload fixtures are prepared with `finishPreparation` and the fixture
  recording `src/ci/cook-preparation.test.ts` already used, so no WebKit.
