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
});

const TreeTaskSchema = z.object({
  label: z.string(),
  subtasks: z.array(SubTaskSchema).default([]),
});

const SubFeatureSchema = z.object({
  label: z.string(),
  tasks: z.array(TreeTaskSchema).default([]),
});

const FeatureSchema = z.object({
  label: z.string(),
  subfeatures: z.array(SubFeatureSchema).default([]),
  tasks: z.array(TreeTaskSchema).default([]),
});

export const TreeDataSchema = z.object({
  appName: z.string(),
  features: z.array(FeatureSchema).min(1),
});

export type TreeData = z.infer<typeof TreeDataSchema>;

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
