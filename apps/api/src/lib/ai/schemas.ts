// Schema Zod untuk validasi output AI
import { z } from 'zod';

// ===============================================
// Chat Reply Schema — bentuk pesan AI dalam chat
// ===============================================

export const FormQuestionSchema = z.object({
  id: z.string().optional().default(() => Math.random().toString(36).substring(7)),
  label: z.string().optional(),
  question: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  type: z.enum(['radio', 'checkbox']).optional().default('radio'),
  options: z.array(z.string()).default([]),
  allowOther: z.boolean().optional().default(true),
  required: z.boolean().optional(),
}).transform((q) => {
  const filtered = q.options
    .filter((opt) => !/^lainnya/i.test(opt.trim()) && !/^other/i.test(opt.trim()))
    .slice(0, 3);
  const rawText = q.question || q.label || q.title || q.text;
  const validText = rawText && rawText.trim() !== '' && rawText.trim() !== 'Pertanyaan' ? rawText.trim() : undefined;
  return {
    id: q.id || Math.random().toString(36).substring(7),
    label: validText || 'Pertanyaan',
    question: validText || undefined,
    type: q.type,
    options: filtered,
    allowOther: true,
    required: q.required,
  };
});

export const ChatFormPayloadSchema = z.object({
  formId: z.string().optional().default(() => 'form-' + Date.now()),
  questions: z.array(FormQuestionSchema).min(1),
});

export const ChatDonePayloadSchema = z.object({
  readyToFinalize: z.boolean().optional().default(true),
  personas: z.array(z.string()).optional(),
  nonGoals: z.array(z.string()).optional(),
  edgeCases: z.array(z.string()).optional(),
  successMetrics: z.array(z.string()).optional(),
});

export const ChatMessageSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    content: z.string(),
    payload: z.any().nullish(),
  }),
  z.object({
    kind: z.literal('form'),
    content: z.string(),
    payload: ChatFormPayloadSchema,
  }),
  z.object({
    kind: z.literal('done'),
    content: z.string(),
    payload: ChatDonePayloadSchema.nullish().transform((val) => val ?? { readyToFinalize: true }),
  }),
]);

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ===============================================
// Tree Data Schema — hierarki App → Fitur → Sub-fitur → Task → Sub-task
// ===============================================

const SubTaskSchema = z.object({
  label: z.string(),
  requirementIds: z.array(z.string()).default([]),
});

const TreeTaskSchema = z.object({
  label: z.string(),
  requirementIds: z.array(z.string()).default([]),
  subtasks: z.array(SubTaskSchema).default([]),
});

const SubFeatureSchema = z.object({
  label: z.string(),
  requirementIds: z.array(z.string()).default([]),
  tasks: z.array(TreeTaskSchema).default([]),
});

const FeatureSchema = z.object({
  label: z.string(),
  requirementIds: z.array(z.string()).default([]),
  subfeatures: z.array(SubFeatureSchema).default([]),
  tasks: z.array(TreeTaskSchema).default([]),
});

export const TreeDataSchema = z.object({
  appName: z.string(),
  features: z.array(FeatureSchema).min(1),
});

export type TreeData = z.infer<typeof TreeDataSchema>;

// ===============================================
// Business Flow Diagram (swimlane per persona)
// ===============================================

export const FlowLaneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: z.enum(['human', 'system', 'external']),
  description: z.string().optional(),
});

export const FlowStepSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['start', 'process', 'decision', 'end']),
  laneId: z.string().min(1),
  requirementIds: z.array(z.string()).default([]),
});

export const FlowEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().nullish(),
});

const isUnique = (values: string[]) => new Set(values).size === values.length;

export const BusinessFlowSchema = z
  .object({
    processName: z.string().min(1),
    lanes: z.array(FlowLaneSchema).min(2).max(6),
    steps: z.array(FlowStepSchema).min(6).max(24),
    edges: z.array(FlowEdgeSchema).min(5),
  })
  .superRefine((flow, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });

    if (!isUnique(flow.lanes.map((l) => l.id))) fail('ID lane harus unik.');
    if (!isUnique(flow.steps.map((s) => s.id))) fail('ID step harus unik.');

    const systemLanes = flow.lanes.filter((l) => l.kind === 'system').length;
    if (systemLanes !== 1) fail('Harus ada tepat 1 lane dengan kind "system".');

    const laneIds = new Set(flow.lanes.map((l) => l.id));
    const stepById = new Map(flow.steps.map((s) => [s.id, s]));

    for (const step of flow.steps) {
      if (!laneIds.has(step.laneId)) fail(`Step "${step.id}" memakai laneId "${step.laneId}" yang tidak ada.`);
    }
    for (const lane of flow.lanes) {
      if (!flow.steps.some((s) => s.laneId === lane.id)) fail(`Lane "${lane.id}" tidak dipakai oleh step mana pun.`);
    }

    const edgeKeys = new Set<string>();
    const outgoing = new Map<string, typeof flow.edges>();
    const incomingCount = new Map<string, number>();
    let edgesValid = true;
    for (const edge of flow.edges) {
      if (!stepById.has(edge.from) || !stepById.has(edge.to)) {
        fail(`Edge "${edge.from}" -> "${edge.to}" merujuk step yang tidak ada.`);
        edgesValid = false;
        continue;
      }
      if (edge.from === edge.to) fail(`Edge "${edge.from}" tidak boleh menunjuk dirinya sendiri.`);
      const key = `${edge.from}>${edge.to}`;
      if (edgeKeys.has(key)) fail(`Edge "${key}" duplikat.`);
      edgeKeys.add(key);
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
      incomingCount.set(edge.to, (incomingCount.get(edge.to) ?? 0) + 1);
    }

    const starts = flow.steps.filter((s) => s.type === 'start');
    if (starts.length !== 1) fail('Harus ada tepat 1 step bertipe "start".');
    if (!flow.steps.some((s) => s.type === 'end')) fail('Harus ada minimal 1 step bertipe "end".');

    for (const step of flow.steps) {
      const out = outgoing.get(step.id) ?? [];
      const inCount = incomingCount.get(step.id) ?? 0;
      if (step.type === 'start' && inCount > 0) fail(`Step start "${step.id}" tidak boleh punya edge masuk.`);
      if (step.type === 'end' && out.length > 0) fail(`Step end "${step.id}" tidak boleh punya edge keluar.`);
      if ((step.type === 'start' || step.type === 'process') && out.length !== 1) {
        fail(`Step "${step.id}" bertipe ${step.type} harus punya tepat 1 edge keluar.`);
      }
      if (step.type === 'decision') {
        if (out.length < 2) fail(`Decision "${step.id}" harus punya minimal 2 edge keluar.`);
        const labels = out.map((e) => (e.label ?? '').trim());
        if (labels.some((l) => !l)) fail(`Semua edge keluar dari decision "${step.id}" harus berlabel.`);
        if (!isUnique(labels)) fail(`Label edge keluar dari decision "${step.id}" harus unik.`);
      }
    }

    if (starts.length === 1 && edgesValid) {
      const seen = new Set([starts[0].id]);
      const queue = [starts[0].id];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of outgoing.get(current) ?? []) {
          if (!seen.has(edge.to)) {
            seen.add(edge.to);
            queue.push(edge.to);
          }
        }
      }
      for (const step of flow.steps) {
        if (!seen.has(step.id)) fail(`Step "${step.id}" tidak dapat dicapai dari step start.`);
      }
    }
  });

export type FlowLane = z.infer<typeof FlowLaneSchema>;
export type FlowStep = z.infer<typeof FlowStepSchema>;
export type FlowEdge = z.infer<typeof FlowEdgeSchema>;
export type BusinessFlow = z.infer<typeof BusinessFlowSchema>;

// ===============================================
// Tech Stack Recommendations
// ===============================================

export const RecommendationResponseBase = z.object({
  reasoning: z.string(),
});

export const RecommendTechStackSchema = RecommendationResponseBase.extend({
  techStack: z.array(z.string()),
});

// Export semua schema yang mungkin dipakai di berbagai tempat
export { FeatureSchema as Feature };
export { SubFeatureSchema as SubFeature };
export { TreeTaskSchema as Task };
export { SubTaskSchema as SubTask };
