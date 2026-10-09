// Validator coverage API endpoint ke UI task.
// Memastikan setiap endpoint mutasi (POST, PUT, PATCH, DELETE) dari PRD atau apiContracts backend
// memiliki task consumer di FRONTEND/INTEGRATION.

import type { TaskGen } from './tasks.js';
import { endpointKey, normalizeEndpointPath as normalizePath } from './endpoint-path.js';

export interface EndpointRef {
  method: string;
  path: string;
  description?: string;
}

export interface ApiCoverageResult {
  uncovered: EndpointRef[];
  warnings: string[];
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Validasi apakah endpoint mutasi memiliki pemanggil di layer FRONTEND atau INTEGRATION.
 */
export function validateApiCoverage(
  tasks: TaskGen[],
  prdEndpoints: Array<{ method: string; path: string; description?: string }> = []
): ApiCoverageResult {
  const warnings: string[] = [];
  const requiredEndpointsMap = new Map<string, EndpointRef>();

  // 1. Kumpulkan dari PRD
  for (const ep of prdEndpoints) {
    const method = ep.method.toUpperCase();
    if (MUTATION_METHODS.has(method)) {
      const normKey = `${method} ${normalizePath(ep.path)}`;
      requiredEndpointsMap.set(normKey, {
        method,
        path: ep.path,
        description: ep.description,
      });
    }
  }

  // 2. Kumpulkan dari apiContracts task BACKEND
  for (const t of tasks) {
    if (t.layer === 'BACKEND' && Array.isArray(t.apiContracts)) {
      for (const contract of t.apiContracts) {
        const method = contract.method.toUpperCase();
        if (MUTATION_METHODS.has(method)) {
          const normKey = `${method} ${normalizePath(contract.path)}`;
          if (!requiredEndpointsMap.has(normKey)) {
            requiredEndpointsMap.set(normKey, {
              method,
              path: contract.path,
              description: contract.description,
            });
          }
        }
      }
    }
  }

  if (requiredEndpointsMap.size === 0) {
    return { uncovered: [], warnings };
  }

  // 3. Kumpulkan jejak konsumsi API di task FRONTEND dan INTEGRATION
  const consumerTasks = tasks.filter((t) => t.layer === 'FRONTEND' || t.layer === 'INTEGRATION');

  const consumedKeys = new Set<string>();

  for (const t of consumerTasks) {
    // Cek field eksplisit consumesApis jika ada
    if (Array.isArray(t.consumesApis)) {
      for (const c of t.consumesApis) {
        const method = c.method.toUpperCase();
        consumedKeys.add(`${method} ${normalizePath(c.path)}`);
      }
    }

    // Fallback pencarian teks toleran di judul, langkah implementasi, DoD, atau kriteria penerimaan
    const taskText = [
      t.title,
      t.description || '',
      ...(t.implementation_steps || []),
      ...(t.acceptanceCriteria || []),
      ...(t.definition_of_done || []),
    ].join(' ').toLowerCase();

    for (const [normKey, ep] of requiredEndpointsMap.entries()) {
      const pathOnly = ep.path.toLowerCase().replace(/\/+/g, '/');
      const segments = pathOnly.split('/').filter((s) => s && !s.startsWith(':'));
      // Jika path literal ada di teks atau segmen utama + method disebutkan
      if (taskText.includes(pathOnly)) {
        consumedKeys.add(normKey);
      } else if (segments.length >= 2 && segments.every((seg) => taskText.includes(seg))) {
        // Cek apakah aksi relevan / kata dialog / form ada di teks
        consumedKeys.add(normKey);
      }
    }
  }

  // 4. Hitung yang belum ter-cover
  const uncovered: EndpointRef[] = [];
  for (const [normKey, ep] of requiredEndpointsMap.entries()) {
    if (!consumedKeys.has(normKey)) {
      uncovered.push(ep);
      warnings.push(
        `Endpoint mutasi ${ep.method} ${ep.path} (${ep.description || 'tanpa deskripsi'}) belum memiliki task UI (form/dialog/tombol) di FRONTEND.`
      );
    }
  }

  return { uncovered, warnings };
}

/**
 * Arah sebaliknya: endpoint yang dipanggil UI (consumesApis task FRONTEND, semua method) tetapi tidak ada di spec
 * maupun di apiContracts task BACKEND. Hasilnya peringatan; tidak mengubah task.
 */
export function findUiApiWithoutBackend(
  tasks: TaskGen[],
  specEndpoints: Array<{ method: string; path: string }> = [],
): Array<{ method: string; path: string; taskId?: string; title: string }> {
  const known = new Set<string>();
  for (const ep of specEndpoints) known.add(endpointKey(ep.method, ep.path));
  for (const t of tasks) {
    if (t.layer !== 'BACKEND') continue;
    for (const c of t.apiContracts ?? []) known.add(endpointKey(c.method, c.path));
  }

  const missing: Array<{ method: string; path: string; taskId?: string; title: string }> = [];
  const seen = new Set<string>();
  for (const t of tasks) {
    if (t.layer !== 'FRONTEND') continue;
    for (const c of t.consumesApis ?? []) {
      const key = endpointKey(c.method, c.path);
      if (known.has(key) || seen.has(`${t.taskId}|${key}`)) continue;
      seen.add(`${t.taskId}|${key}`);
      missing.push({ method: c.method.toUpperCase(), path: c.path, taskId: t.taskId, title: t.title });
    }
  }
  return missing;
}
