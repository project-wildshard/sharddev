# Align the canonical linked format graph

> Written by: Codex
> **State:** built, 2026-11-16.

LOCAL-LINK LL1 now registers the current format checkout. Engine main
uses released format0.13; SDK still declared0.12, so the local link
guard and repo-kit's actual public-SDK proof correctly refuse the mixed
graph. Align SDK's direct dependency and root override to0.13, keeping
the published engine0.1.31 pin. Prove normal pinned types and actual
published-client browser play before accepting this dependency change.
Keep the link guard and every child's publication verifier intact.

Pinned type checking passes. Both packed new/dev browser cases pass
against the actual published engine0.1.31 client (empty6.97s,
default12.94s), with zero page/HTTP/cleanup faults. Normal full push
gate and the expanded canonical linked check remain the acceptance.
