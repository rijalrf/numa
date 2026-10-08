import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTasksPrompt, type GenerateTasksArgs, type PhaseScope } from '../tasks.js';

/** Seluruh teks prompt: aturan layer tersebar di pesan system dan user. */
const promptText = (args: GenerateTasksArgs) => {
  const { system, user } = buildTasksPrompt(args);
  return `${system}\n${user}`;
};

const feature = { id: 'f1', title: 'Fitur', dependsOn: [] as string[] };
const base = (layer: PhaseScope['layer'], phase?: boolean) =>
  ({
    roadmap: { phases: [{ order: 2, title: 'Fase uji', layer, features: [feature] }] },
    projectName: 'Uji',
    projectId: 'p1',
    ...(phase ? { phase: { order: 2, title: 'Fase uji', layer, prefix: 'P2', otherPhases: '- Fase 1 [BOOTSTRAP] Fondasi: Init (featureId: f0)' } } : {}),
  }) as unknown as GenerateTasksArgs;

test('mode fase: lingkup, awalan taskId, dan ringkasan fase lain masuk prompt', () => {
  const { system, user } = buildTasksPrompt(base('BACKEND', true));
  assert.match(system, /LINGKUP FASE INI/);
  assert.match(system, /awalan P2-/);
  assert.match(user, /RINGKASAN FASE LAIN/);
  assert.match(user, /featureId: f0/);
  assert.match(user, /"taskId": "P2-001"/);
});

test('mode fase: aturan layer lain tidak ikut (BACKEND tanpa aturan FRONTEND/INTEGRATION/BOOTSTRAP)', () => {
  const text = promptText(base('BACKEND', true));
  assert.match(text, /ATURAN WAJIB LAYER BACKEND/);
  assert.doesNotMatch(text, /Aturan khusus FRONTEND/);
  assert.doesNotMatch(text, /Wajib pada layer INTEGRATION/);
  assert.doesNotMatch(text, /WAJIB ada task BOOTSTRAP di awal/);
});

test('mode fase: FRONTEND membawa aturan FRONTEND tanpa aturan BACKEND', () => {
  const text = promptText(base('FRONTEND', true));
  assert.match(text, /Aturan khusus FRONTEND/);
  assert.doesNotMatch(text, /ATURAN WAJIB LAYER BACKEND/);
});

test('mode fase: BOOTSTRAP dan INTEGRATION membawa aturan khususnya', () => {
  assert.match(promptText(base('BOOTSTRAP', true)), /WAJIB ada task BOOTSTRAP di awal/);
  const integ = promptText(base('INTEGRATION', true));
  assert.match(integ, /Wajib pada layer INTEGRATION/);
  assert.match(integ, /WAJIB ada WIRING tasks/);
});

test('mode fase lebih kecil dari mode penuh; mode penuh (cycle) tetap memuat semua aturan', () => {
  const full = promptText(base('BACKEND'));
  assert.match(full, /Aturan khusus FRONTEND/);
  assert.match(full, /ATURAN WAJIB LAYER BACKEND/);
  assert.match(full, /Wajib pada layer INTEGRATION/);
  assert.match(full, /TASK-001, TASK-002/);
  assert.ok(promptText(base('BACKEND', true)).length < full.length);
});
