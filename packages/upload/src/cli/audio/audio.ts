import { installFormatHook } from '@wildshard/format/formatHook'

import { refusalHint, refusalNote } from '../../sharddev/refusals.ts'

import type { AudioReport } from '@wildshard/format/audioRules'

// AUDIO AU5 (meta docs/plans/AUDIO-PLAN.md, J299): format owns the audio
// rules. `pack` prints every finding as AMBER and still packs; `upload`
// refuses a red before it spends the upload, as api-server's admission
// will. A waiver lives in the shard source (`audio-waiver.json`).

/** The report as build prints it: totals, then one AMBER line per finding,
 * each followed by its rule, fix and GUIDE.md link, named by its code (SA41). */
async function audioLines(report: Readonly<AudioReport>): Promise<string[]> {
  installFormatHook()
  const { audioReportLines } = await import('@wildshard/format/audioRules')
  const [totals = '', ...findings] = audioReportLines(report)
  return [
    totals,
    ...findings.flatMap((line: string, at: number): string[] => {
      const finding = report.findings[at]
      return finding === undefined
        ? [line]
        : [
            line,
            `  ${refusalHint(refusalNote('shardfile', finding.message, { code: finding.code }))}`,
          ]
    }),
  ]
}

/** Refuse a red report, with format's reason. */
async function assertAudio(report: Readonly<AudioReport>): Promise<void> {
  installFormatHook()
  const { assertAudioAdmission } = await import('@wildshard/format/audioRules')
  assertAudioAdmission(report)
}

export { assertAudio, audioLines }
