import { setTimeout as sleep } from 'node:timers/promises'

import { ApiRefusalError, readUploadStatus } from './api.ts'

import type { ApiOptions } from './api.ts'
import type { UploadState, UploadStatus } from './wire.ts'

const INITIAL_DELAY_MS = 2000
const MAX_DELAY_MS = 15_000
const MAX_WAIT_MS = 1_200_000
const REQUEST_TIMEOUT_MS = 15_000
const BACKOFF = 2
const SERVER_ERROR = 500
const TOO_MANY_REQUESTS = 429
const NONE = 0

interface PollPorts {
  readonly now: () => number
  readonly sleep: (milliseconds: number) => Promise<void>
  readonly read: typeof readUploadStatus
}
interface PollRequest {
  readonly status?: UploadState
  readonly id: string
  readonly hash: string
  readonly report: (line: string) => void
}
interface Polling extends PollRequest {
  readonly options: ApiOptions
  readonly ports: PollPorts
  readonly deadline: number
}
interface PollState {
  readonly seen: UploadState | undefined
  readonly delay: number
}

function timedOut(id: string): Error {
  return new Error(
    `upload ${id}: timed out waiting for the verdict; resume with wildshard upload status ${id}`,
  )
}

function reportStatus(
  status: UploadStatus,
  report: (line: string) => void,
): void {
  report(`upload ${status.uploadId}: ${status.status}`)
  if (status.status === 'refused' && status.report !== undefined) {
    report(JSON.stringify(status.report, undefined, BACKOFF))
  }
}

function requireSuccess(status: UploadStatus): void {
  if (status.status === 'refused' || status.status === 'stalled') {
    throw new Error(`upload ${status.uploadId}: ${status.status}`)
  }
}

function retryable(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')) ||
    (error instanceof ApiRefusalError &&
      (error.status >= SERVER_ERROR || error.status === TOO_MANY_REQUESTS))
  )
}

async function readMatching(
  session: Polling,
  remaining: number,
): Promise<UploadStatus> {
  const timeout = Math.ceil(Math.min(remaining, REQUEST_TIMEOUT_MS))
  const status = await session.ports.read(
    session.options,
    session.id,
    AbortSignal.timeout(timeout),
  )
  if (status.uploadId !== session.id || status.hash !== session.hash) {
    throw new Error('upload status does not match the accepted upload')
  }
  return status
}

async function observe(session: Polling): Promise<UploadStatus | undefined> {
  const remaining = session.deadline - session.ports.now()
  if (remaining <= NONE) {
    throw timedOut(session.id)
  }
  try {
    return await readMatching(session, remaining)
  } catch (error: unknown) {
    if (!retryable(error)) {
      throw error
    }
    if (session.ports.now() >= session.deadline) {
      throw timedOut(session.id)
    }
    return undefined
  }
}

function isLive(
  session: Polling,
  status: UploadStatus,
  seen: UploadState | undefined,
): boolean {
  if (status.status !== seen || status.status === 'refused') {
    reportStatus(status, session.report)
  }
  requireSuccess(status)
  return status.status === 'live'
}

async function poll(session: Polling, state: PollState): Promise<UploadStatus> {
  const status = await observe(session)
  if (status !== undefined && isLive(session, status, state.seen)) {
    return status
  }
  const delay = Math.min(state.delay, session.deadline - session.ports.now())
  if (delay <= NONE) {
    throw timedOut(session.id)
  }
  await session.ports.sleep(delay)
  return await poll(session, {
    seen: status?.status ?? state.seen,
    delay: Math.min(state.delay * BACKOFF, MAX_DELAY_MS),
  })
}

/** No background worker remains after success, refusal, stall or timeout. */
async function waitForUpload(
  options: ApiOptions,
  request: PollRequest,
  ports: Partial<PollPorts> = {},
): Promise<UploadStatus> {
  const clock: PollPorts = {
    now: (): number => performance.now(),
    sleep: async (milliseconds: number): Promise<void> => {
      await sleep(milliseconds)
    },
    read: readUploadStatus,
    ...ports,
  }
  return await poll(
    { ...request, options, ports: clock, deadline: clock.now() + MAX_WAIT_MS },
    { seen: request.status, delay: INITIAL_DELAY_MS },
  )
}

/** One authenticated read, also used by `upload status <id>`. */
async function printUploadStatus(
  options: ApiOptions,
  id: string,
  report: (line: string) => void,
): Promise<UploadStatus> {
  const status = await readUploadStatus(
    options,
    id,
    AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  )
  if (status.uploadId !== id) {
    throw new Error('upload status does not match the requested upload')
  }
  reportStatus(status, report)
  requireSuccess(status)
  return status
}

export { type PollPorts, printUploadStatus, waitForUpload }
