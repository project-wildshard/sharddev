declare const plugin: { readonly meta: { readonly name: string }; readonly rules: Readonly<Record<string, object>> };
/** Engine's public-index report names an import of a real SDK export (a bundler `?query` aside). */
export declare function sdkExportReport(message: string | undefined): boolean;
export default plugin;
