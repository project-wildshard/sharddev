# Prepare browser preflight

> Written by: Codex
> State: implemented and locally proved, 2026-11-16 (MU3 / F30).

The mini fetched 296 MB before discovering its WebKit launch was stuck.
Check the SDK's pinned headless browser before fetching a client, and
bound both launches to 20 seconds. Keep WebKit's default flags; Chromium
flags are not WebKit options. A failed preflight leaves the candidate
untouched and names the exact Playwright installer plus the fallback
of preparing on another machine with working WebKit. An external preview
still needs local WebKit. Print HTTP download size before reading bytes.

MacBook macOS 26.7.1, arm64, pinned Playwright 1.65.0 / WebKit 27.2:
the clean npm0.3.2 scaffold both built and prepared (15 programs), so the
mini's 180-second timeout did not reproduce on this machine. The updated
SDK also prepared that draft with its engine0.1.24 client (297.6 MB).
An isolated fresh WebKit download took 6,771 ms on first launch and 186 ms
on repeat. No Chromium flags, browser downgrade or quarantine removal.

Three real-process controls pass: missing binary refuses before fetching,
an unresponsive launcher refuses in 51.8 seconds including Playwright's
30-second graceful shutdown allowance, and a real headless phone page
opens. The hung child is gone and draft bytes/cache remain unchanged.
Ten focused preview/recorder/download cases, strict lint and types pass.
