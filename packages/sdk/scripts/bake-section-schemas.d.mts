/** Generate wire schemas and standalone types from the build-only registry. */
export function sectionSchemaTables(root:string,slug:string):Promise<{tables:Readonly<Record<string,string>>;report:{path:string;sourceHash:string;schemas:number;bytes:number}}>;
export function writeSectionSchemaTables(root:string,slug:string,options?:{check?:boolean}):Promise<{path:string;sourceHash:string;schemas:number;bytes:number}>;
