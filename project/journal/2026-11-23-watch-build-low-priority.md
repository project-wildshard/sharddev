# The idle full build of watch runs at the lowest priority (opus-compat-w9)

- hosted ci 'products (browser)' kept timing out at 120 s on the author-world watch e2e (run 45129793811, and
  five of the last eleven main runs). Its trace shows the first page boot took 38 s and
  stalled 21 s at firstFrame while AP20's idle full build ran its 31.8 s at normal priority on the 4-core runner.
  The quest edit rebuilds the shell when online (`shellKey` + gameplay hash) and reloads the page; 5 s later the
  next full build started beside the second boot, which was still running when the test hit 120 s.
- The full build is a background report, so `backgroundCommand` starts it under `nice -n 19` on POSIX. Every thread
  and process it starts inherits that priority. The page and the edit path come first. Timeouts are unchanged.
