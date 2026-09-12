import type{AnalyzerProjectStore,AnalyzerSourceFile}from'./types';
/** Dictionary and empty Analyzer screens do not load manifest parsers. */
export async function scanProjectFiles(files:AnalyzerSourceFile[]):Promise<AnalyzerProjectStore>{return(await import('./scan')).scanProjectFiles(files);}
