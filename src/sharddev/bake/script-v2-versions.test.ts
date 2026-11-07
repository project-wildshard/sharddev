import { expect,test } from 'vitest';
import { SCRIPT_V2_REVISIONS,parseScriptArtifactV2,admitScriptV2 } from '@wildshard/format/scriptAdmissionV2';
import { compileScriptV2 } from './compileScriptV2';

const row = () => ({ abi: 2,minor: 0,compilerRevision: 1,admissionRevision: 1,hash: 'a'.repeat(64),lane: 'view',pages: 1,ioBytes: 656 });
test('artifact metadata snapshots one explicit contract and refuses unknown versions and layouts', () => {
  const input = row(), selected = parseScriptArtifactV2(input);input.pages = 4;input.lane = 'sim';
  expect(selected).toEqual(row());expect(Object.isFrozen(selected)).toBe(true);
  for (const change of [{ abi: 1 },{ minor: 1 },{ compilerRevision: 2 },{ admissionRevision: 2 },{ lane: 'unknown' },{ pages: 5 },{ ioBytes: 65537 },{ hash: `${'a'.repeat(64)}\n` },{ extra: true }]) {
    expect(() => parseScriptArtifactV2({ ...row(),...change })).toThrow();
  }
});
test('compiler and executable admission refuse unsupported revisions before entering their pipelines', async () => {
  expect(SCRIPT_V2_REVISIONS).toEqual({ abi: 2,minor: 0,compiler: 1,admission: 1 });
  await expect(compileScriptV2('',{ compilerRevision: 2 })).rejects.toThrow('compiler revision');
  expect(() => admitScriptV2(new Uint8Array(),{ admissionRevision: 2 })).toThrow('compiler/admission revision');
  expect(() => admitScriptV2(new Uint8Array(),{ compilerRevision: 2 })).toThrow('compiler/admission revision');
});
