// Helper format markdown export dokumen proyek (PRD/BRD + daftar tasks).
import { readPrdContent } from './ai/prd.js';

export function buildPrdMarkdown(project: { name: string }, prd: { generatedAt: Date | string; version: number; content: any }): string {
  const prdDoc = readPrdContent(prd.content);
  return prdDoc.markdown || `# Product Requirements Document (${project.name})\n\n(tidak ada konten)`;
}

export function buildTasksMarkdown(project: { name: string }, tasks: any[]): string {
  const lines = [
    `# Daftar Atomic Tasks — ${project.name}`,
    ``,
    `Total Tasks: ${tasks.length}`,
    ``,
  ];

  if (tasks.length === 0) {
    lines.push(`(Belum ada task yang dibuat)`);
    return lines.join('\n');
  }

  for (const t of tasks) {
    const aiCtx = (t.aiContext ?? {}) as any;
    lines.push(`## [${t.order}] ${t.title} (${t.layer})`);
    lines.push(`- **ID:** \`${t.id}\``);
    if (aiCtx.requirement_ids?.length) {
      lines.push(`- **Requirements PRD:** ${aiCtx.requirement_ids.join(', ')}`);
    }
    lines.push(`- **Status:** ${t.status}`);
    lines.push(`- **Deskripsi:** ${t.description || '-'}`);
    lines.push(``);

    if (aiCtx.files_to_create?.length) {
      lines.push(`### Files to Create`);
      lines.push(aiCtx.files_to_create.map((f: string) => `- \`${f}\``).join('\n'));
      lines.push(``);
    }
    if (aiCtx.files_to_modify?.length) {
      lines.push(`### Files to Modify`);
      lines.push(aiCtx.files_to_modify.map((f: string) => `- \`${f}\``).join('\n'));
      lines.push(``);
    }
    if (aiCtx.forbidden?.length) {
      lines.push(`### Forbidden Files`);
      lines.push(aiCtx.forbidden.map((f: string) => `- \`${f}\``).join('\n'));
      lines.push(``);
    }
    if (t.acceptanceCriteria && Array.isArray(t.acceptanceCriteria) && t.acceptanceCriteria.length) {
      lines.push(`### Acceptance Criteria`);
      lines.push(t.acceptanceCriteria.map((ac: string) => `- ${ac}`).join('\n'));
      lines.push(``);
    }
    if (aiCtx.validation_commands?.length) {
      lines.push(`### Validation Commands`);
      lines.push(`\`\`\`bash`);
      lines.push(aiCtx.validation_commands.join('\n'));
      lines.push(`\`\`\``);
      lines.push(``);
    }
    lines.push(`---`);
    lines.push(``);
  }

  return lines.join('\n');
}
