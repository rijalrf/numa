// Konversi konten PRD (string / objek terstruktur / markdown) menjadi Markdown siap tampil.
// Murni — tanpa dependency commander.

export function formatPrdMarkdown(
  content: unknown,
  prdObj: { version: number; generatedAt: string | Date }
): string {
  if (!content) return '# Product Requirements Document\n\n(PRD kosong)';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    const obj = content as Record<string, any>;
    if (typeof obj.markdown === 'string') {
      return obj.markdown;
    }

    // Format JSON structured PRD
    const parts: string[] = [];
    parts.push('# Product Requirements Document');
    parts.push('');
    parts.push(`**Generated:** ${new Date(prdObj.generatedAt).toLocaleString('id-ID')}`);
    parts.push(`**Version:** ${prdObj.version}`);
    parts.push('');
    parts.push('---');
    parts.push('');

    if (obj.overview) {
      parts.push('## Ringkasan Produk', '', obj.overview, '', '---', '');
    }
    if (Array.isArray(obj.goals) && obj.goals.length > 0) {
      parts.push('## Tujuan Produk', '');
      for (const g of obj.goals) parts.push(`- ${g}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.features) && obj.features.length > 0) {
      parts.push('## Fitur Utama', '');
      for (const f of obj.features) {
        parts.push(`### ${f.name || 'Fitur'}`);
        parts.push(f.description || '(tidak ada deskripsi)');
        parts.push('');
      }
      parts.push('---', '');
    }
    if (Array.isArray(obj.functionalRequirements) && obj.functionalRequirements.length > 0) {
      parts.push('## Functional Requirements', '');
      for (const r of obj.functionalRequirements) {
        parts.push(`- **${r.id}** ${r.title}: ${r.description}`);
      }
      parts.push('', '---', '');
    }
    const rules =
      Array.isArray(obj.productRules) && obj.productRules.length > 0
        ? obj.productRules
        : obj.businessRules;
    if (Array.isArray(rules) && rules.length > 0) {
      parts.push('## Aturan Produk & Bisnis', '');
      for (const r of rules) parts.push(`- **${r.id}**: ${r.description}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.techRequirements) && obj.techRequirements.length > 0) {
      parts.push('## Kebutuhan Teknologi', '');
      for (const t of obj.techRequirements) parts.push(`- ${t}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.dataModels) && obj.dataModels.length > 0) {
      parts.push('## Model Data', '```json', JSON.stringify(obj.dataModels, null, 2), '```', '', '---', '');
    }
    if (Array.isArray(obj.apiEndpoints) && obj.apiEndpoints.length > 0) {
      parts.push('## Spesifikasi Endpoint API', '```json', JSON.stringify(obj.apiEndpoints, null, 2), '```', '', '---', '');
    }
    if (Array.isArray(obj.nonFunctional) && obj.nonFunctional.length > 0) {
      parts.push('## Kebutuhan Non-Fungsional', '');
      for (const n of obj.nonFunctional) parts.push(`- ${n}`);
      parts.push('', '---', '');
    }
    if (Array.isArray(obj.outOfScope) && obj.outOfScope.length > 0) {
      parts.push('## Di Luar Lingkup (Out of Scope)', '');
      for (const o of obj.outOfScope) parts.push(`- ${o}`);
      parts.push('');
    }

    return parts.join('\n');
  }
  return String(content);
}
