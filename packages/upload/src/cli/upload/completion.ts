import { placementLines } from './placement.ts'
import { waitForUpload } from './status.ts'

import type { ApiOptions, Channel } from './api.ts'
import type { CommitAnswer, UploadState } from './wire.ts'

interface CompletionOptions extends ApiOptions {
  readonly wait?: boolean
  readonly channel: Channel
  readonly place?: boolean
  readonly report: (line: string) => void
}
interface Completion {
  readonly uploadId?: string | undefined
  readonly status?: UploadState | undefined
  readonly gridReport: readonly string[]
}

function queued(
  accepted: Readonly<{ uploadId: string; status: UploadState }>,
): Completion {
  if (accepted.status === 'refused' || accepted.status === 'stalled') {
    throw new Error(
      `upload ${accepted.uploadId}: ${accepted.status}; ${accepted.status === 'stalled' ? 'it may still settle; ' : ''}read verdict with wildshard upload status ${accepted.uploadId}`,
    )
  }
  return { ...accepted, gridReport: [] }
}

function announce(
  options: CompletionOptions,
  accepted: Readonly<{ uploadId: string; status: UploadState | undefined }>,
): Readonly<{ uploadId: string; status: UploadState }> {
  if (accepted.status === undefined) {
    throw new Error('the API accepted an upload without its status')
  }
  options.report(`checked: API format accepted (upload ${accepted.uploadId})`)
  options.report(`upload ${accepted.uploadId}: ${accepted.status}`)
  if (accepted.status !== 'live') {
    options.report(`resume with wildshard upload status ${accepted.uploadId}`)
  }
  return { uploadId: accepted.uploadId, status: accepted.status }
}

/** Legacy servers finish at commit; the async protocol finishes at live. */
async function completeUpload(
  options: CompletionOptions,
  answer: CommitAnswer,
): Promise<Completion> {
  const placing = { channel: options.channel, place: options.place !== false }
  if (answer.uploadId === undefined) {
    return { gridReport: placementLines(answer, placing) }
  }
  const accepted = announce(options, {
    uploadId: answer.uploadId,
    status: answer.status,
  })
  if (options.wait === false && accepted.status === 'live') {
    return {
      ...accepted,
      gridReport: placementLines(answer, placing),
    }
  }
  if (options.wait === false) {
    return queued(accepted)
  }
  const status = await waitForUpload(options, {
    id: answer.uploadId,
    hash: answer.hash,
    report: options.report,
    status: accepted.status,
  })
  return {
    uploadId: answer.uploadId,
    status: status.status,
    gridReport: placementLines(
      { ...answer, placement: status.placement },
      placing,
    ),
  }
}

export { type Completion, completeUpload }
