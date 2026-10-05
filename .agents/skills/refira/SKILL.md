---
name: refira
version: 0.3.1
description: Visual design craftsmanship and prototype building guide for Refira projects, focusing on high-aesthetic UI execution without AI slop.
---

# Refira Design Craftsmanship & Anti-AI-Slop Guide

Use this skill when designing UI layouts, pages, and interactive components for Refira prototypes. This guide governs visual aesthetics, spatial rhythm, and product polish.

---

## 1. Eliminate "AI Slop" Visual Clichés

AI-generated interfaces often look unmistakably generic and uninspired. Avoid these recognizable patterns:

| Cliché Pattern | Why It Fails | What to Do Instead |
|---|---|---|
| **The 3-Card Symmetrical Grid** | Every AI outputs identical 3 feature boxes with centered icons. | Use asymmetric layouts: bento grids, 60/40 splits, or progressive disclosure lists. |
| **Harsh Purple / Blue Neon Gradients** | Saturated linear gradients screaming generic AI template. | Use subtle radial ambient glows (`bg-radial`), muted neutral backgrounds, and high-contrast intentional accents. |
| **Vague, Meaningless Copy** | "Revolutionize your workflow with next-gen intelligence". | Write concrete, domain-specific copy: "Deploy schema migrations in 240ms with zero downtime". |
| **Centered Everything** | Defaulting to text-center for entire sections causes visual fatigue. | Anchor body copy and headers to left-align (`text-left`) with disciplined margins. |
| **Uniform Spacing** | Applying the same `gap-4` and `p-6` to every single container. | Create clear hierarchical breathing room: large section gaps (`py-20`), snug content groups (`space-y-3`). |

---

## 2. Visual Hierarchy & Typography Discipline

- **Scale Contrast:** Never make subtitle text close in size to the heading. Pair bold, tight display titles (`text-4xl md:text-5xl font-bold tracking-tight`) with quiet, readable body copy (`text-base text-slate-600 leading-relaxed`).
- **Font Weights:** Limit yourself to 2–3 font weights per view (e.g., `font-normal`, `font-medium`, `font-semibold`). Avoid scattering ultra-bold and ultra-thin variants arbitrarily.
- **Labeling & Eyebrows:** Use tasteful uppercase badges or pill tags (`text-xs font-semibold uppercase tracking-wider text-primary px-2.5 py-1 rounded-full bg-primary/10`) to introduce section themes.

---

## 3. Surface Treatment & Micro-Details

- **Subtle Borders over Drop Shadows:** Heavy blur shadows look dated. Instead, use crisp hairline borders (`border border-slate-200/80` or in dark mode `border-white/10`).
- **Layered Elevation:** When elevation is needed, combine a hairline border with a soft, diffused shadow (`shadow-sm shadow-slate-900/5`).
- **Active State Feedback:** Every interactive button and link must have clear hover and transition states (`transition-all duration-150 active:scale-[0.98]`).
- **Icon Sizing:** Keep icons proportional to adjacent typography. For 14px–16px text, use 16px–18px icons (`w-4 h-4` or `w-5 h-5`) with consistent 1.5px to 2px stroke widths.

---

## 4. Bento Grid & Asymmetric Layout Patterns

When presenting features, data, or product capabilities:
- Create a primary hero card spanning 2 columns with a high-fidelity visual or interactive mini-preview.
- Accompany it with compact metric cards, interactive toggle previews, or activity tickers.
- Keep border radii cohesive across cards (e.g., all `rounded-2xl` with inner elements `rounded-xl`).

---

## 5. Contextual State & Multi-Page Navigation Discipline

When generating multiple pages within the same application archetype (e.g. Dashboard/Admin):
- **Dynamic Active Navigation:** Always parameterize navigation macros to reflect the current page context: `<x-dashboard-sidebar active="inventory" />`. Never leave static default highlights active for the wrong page.
- **Dynamic Contextual Headers:** Pass explicit `title` and `category` props to header macros: `<x-dashboard-header category="Warehouse" title="Inventory Management" />`.
- **Decoupled Shell Architecture:** Reusable shell components must accept props rather than having hardcoded page titles, breadcrumbs, or active menu styles.

---

## 6. Prototype Workflow in Refira

0. Authentication Invariant: AI Agents are strictly forbidden from running `refira auth login`. If unauthenticated, prompt the human user to run `refira auth login` in their terminal before proceeding.
1. Check Product Context, current tokens & layout focus: `refira context`
   - Follow strict authority order: **Quick Brief** > **Supporting PRD** (`.refira/PRD.md`) > **Design Context**.
   - Read the Quick Brief completely, inspect the printed PRD Outline, and read only relevant line ranges in `.refira/PRD.md`. If server PRD replacement/deletion requires approval, ask the user conversationally before running `refira context --approve-prd-sync`.
   - Inspect Active Project Layout Focus and existing page archetypes.
   - If the new page requires a different architectural archetype, ask user for confirmation and run `refira layout select <slug>`.
2. Generate base page & trigger canvas pulse: `refira scaffold --page <slug> --layout <slug>`
3. Fill layout using real reusable components (`<x-...>`) and Tailwind classes applying the aesthetic principles above.
4. Stream to Refira Canvas: `refira push <slug>.html --page <slug>`
5. Mandatory: Never stop after writing local files. Always execute `refira push` to complete the task.
