#!/usr/bin/env python3
"""run_codex.py <jobs.json> [--timeout 1500] — one headless codex image_gen run per job, in parallel.

Shard-agnostic: the jobs (mkjobs.py --shard <slug>) carry the shard's prompts and paths. Each job: {"id", "inputs":
[paths], "prompt", "out"}. The runner reads `session id:` from each run's log, polls
~/.codex/generated_images/<session id>/ for the PNG, copies it to `out` and kills that codex (AGENTS.md).
"""
import json, os, re, subprocess, sys, time, shutil, signal

HERE = os.getcwd()  # logs + -o files land in the working directory (run it from a scratch folder)
GEN = os.path.expanduser('~/.codex/generated_images')

jobs = json.load(open(sys.argv[1]))
TIMEOUT = float(sys.argv[sys.argv.index('--timeout') + 1]) if '--timeout' in sys.argv else 1500
procs = {}
for j in jobs:
    if os.path.exists(j['out']):
        print('skip (exists)', j['id']); continue
    log = os.path.join(HERE, f"{j['id']}.log")
    cmd = ['codex', 'exec', *(['-m', os.environ['CODEX_MODEL']] if os.environ.get('CODEX_MODEL') else []), '-s', 'workspace-write', '--skip-git-repo-check', '-C', HERE, '--add-dir', GEN]
    for i in j['inputs']:
        cmd += ['-i', i]
    cmd += ['-o', os.path.join(HERE, f"{j['id']}.last.txt"), j['prompt']]
    f = open(log, 'w')
    p = subprocess.Popen(cmd, stdout=f, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, start_new_session=True)
    procs[j['id']] = (p, log, j)
    print('started', j['id'], p.pid, flush=True)

t0 = time.time()
pending = dict(procs)
while pending and time.time() - t0 < TIMEOUT:
    time.sleep(10)
    for jid, (p, log, j) in list(pending.items()):
        txt = open(log, errors='ignore').read()
        m = re.search(r'session id:\s*([0-9a-f-]+)', txt)
        if m:
            d = os.path.join(GEN, m.group(1))
            if os.path.isdir(d):
                pngs = sorted([x for x in os.listdir(d) if x.endswith('.png')])
                if pngs:
                    src = os.path.join(d, pngs[0])
                    # wait until the file size is stable
                    s1 = os.path.getsize(src); time.sleep(2)
                    if os.path.getsize(src) == s1 and s1 > 0:
                        shutil.copy(src, j['out'])
                        print(f'done {jid} {time.time()-t0:.0f}s -> {j["out"]}', flush=True)
                        try: os.killpg(p.pid, signal.SIGTERM)
                        except (ProcessLookupError, PermissionError): pass
                        del pending[jid]
                        continue
        if p.poll() is not None and jid in pending:
            print(f'EXITED without image: {jid} rc={p.returncode} (see {log})', flush=True)
            del pending[jid]
for jid, (p, log, j) in pending.items():
    print('TIMEOUT', jid, flush=True)
    try: os.killpg(p.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError): pass
