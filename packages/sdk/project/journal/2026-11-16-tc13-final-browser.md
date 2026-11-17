# Fresh default project browser proof

> Written by: Codex
> **State:** built, 2026-11-16 18:23 Cancún.

TC13's default-project browser proof stayed on the old held branch while
engine's published dev client omitted discovery card art. Engine0.1.31
contains the publication fix and SDK0.3.6 pins that release. Restore the
second packed-new case on shared main, keeping the original empty case,
unchanged frame/error assertions and bounded independent cleanup.

Both local native headless Chromium cases pass: empty7.968s and
default14.059s. Each packs the SDK, makes a new project and uses its packed
dev command with the real published client. No client replacement or
error suppression. Default door/cross/save stays in the existing explicit
Ring2 worker journey; fighting belongs to ONE-FORMAT OF42.

Keep a final-state screenshot and renderer diagnostic on failure. The
new case remains report-only Ring2, outside hooks and quick discovery.
Hosted actual receipts, rather than report-only job colour, decide TC13.

Hosted43979364554 passed all reference cases and the empty browser, but
the actual default browser failed its unchanged10s/13frame wait: game6
to16 and draw354 to394, healthy entered play, no faults or cleanup errors.
The job was green because this step reports only. Preserve that failure.
Linux now selects explicit ANGLE SwiftShader, the earlier held diagnostic
configuration, rather than relying on implicit Vulkan SwiftShader. The
optional software flag also allows reproducing the renderer locally.
All frame, render, error and lifecycle assertions remain unchanged.

Hosted43982285539 instead times out while loading application modules:
all39sections delivered, no probe yet, no faults, screenshot still at
the load card. Software rendering alone does not remove cold-run variance.
Boot and progress now share the existing hard80s cancellation deadline,
rather than independent arbitrary30s/10s sublimits. The120s outer test
and cleanup bounds stay intact. This is the explicit Ring2 boot proof,
not an FPS gate: it still must earn13real simulation/render frames and
pass every health, authored-section, version, fault and cleanup oracle.

Hosted43984359094 earns all play/version/error assertions (game6→19,
draw354→406, health100, faults empty), then the80s proof timer kills
Chrome while its unbounded screenshot is capturing. Stop that timer
after the last real assertion, and bound optional PNG capture to3s in
the already-reserved40s artifact/cleanup budget. Record capture failure
without changing the play verdict; independent clean browser/dev shutdown
remains mandatory. A screenshot is evidence, not a boot/play criterion.

Hosted43986516989 again earns every play oracle, but timed-out software
PNG readback also wedges default Chromium shutdown. Skip optional PNG
on SwiftShader; retain mandatory real render-frame progress, all JSON
facts and independent clean shutdown. Metal PNG is already retained.
Restore the held browser-only manual diagnostic to verify this artifact
change without rebaking unchanged products. Full push/nightly Ring2
still runs every step; the diagnostic explicitly earns no full-ring credit.

Manual43989420015 proves the same full play facts without PNG, but
graceful close still exceeds5s. Readback was not the whole shutdown cause.
Use BrowserServer.kill() as the bounded fallback: the installed public API
waits for process exit. Verify exitCode/signalCode, retain forced shutdown
and its graceful-close warning, and fail cleanup if termination cannot be
confirmed. This requires real resource closure rather than treating slow
graceful GPU shutdown as a failed play assertion. No play oracle changes.
