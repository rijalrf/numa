// Normalisasi path endpoint agar perbandingan antar sumber (spec, kontrak task, pemanggil UI) konsisten.

/** Samakan variasi parameter (:id, [id], {id}) menjadi :param, huruf kecil, tanpa query string dan slash ganda/akhir. */
export function normalizeEndpointPath(rawPath: string): string {
  return rawPath
    .trim()
    .toLowerCase()
    .replace(/[?#].*$/, '')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:[a-z0-9_]+/g, ':param')
    .replace(/\[\.{0,3}[a-z0-9_]+\]/g, ':param')
    .replace(/\{[a-z0-9_]+\}/g, ':param');
}

export function endpointKey(method: string, path: string): string {
  return `${method.trim().toUpperCase()} ${normalizeEndpointPath(path)}`;
}
