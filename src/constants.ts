/** File extensions for JavaScript/TypeScript source files */
export const JS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

/** Check if a file extension is JavaScript/TypeScript */
export function isJsFile(ext: string): boolean {
  return JS_EXTENSIONS.has(ext);
}
