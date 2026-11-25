// The recorder's one summary line. QA 11-16 mini F40 (re-walked in meta QA 11-25 row 20 on sdk 0.4.34): `wildshard
// prepare` records into a scratch folder it deletes before it exits, so with `scratch` the line names no path.
export function recordingLine({slug,programs,shaders,lines,bytes,file,build,scratch}){
  const size=`${(bytes/1048576).toFixed(2)} MB`;
  return `${slug}: ${programs} programs, ${shaders} shaders, ${lines} lines, ${scratch?`${size} recorded`:`${size} -> ${file}`} (${build})`;
}
