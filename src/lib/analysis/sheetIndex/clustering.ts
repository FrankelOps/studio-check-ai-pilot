// ============================================================
// SHEET INDEX v3.0 - DETERMINISTIC CLUSTERING (REQ-2)
// Scale-normalized eps + explicit tiebreak ladder
// ============================================================

import type { LabelHit, LabelCluster, PxBBox } from './types';
import { getMedianLabelHeight } from './labels';

/**
 * Calculate Euclidean distance between two points
 */
function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Compute bounding box encompassing all members
 */
function computeClusterBBox(members: LabelHit[]): PxBBox {
  if (members.length === 0) {
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const m of members) {
    minX = Math.min(minX, m.bbox.x);
    minY = Math.min(minY, m.bbox.y);
    maxX = Math.max(maxX, m.bbox.x + m.bbox.w);
    maxY = Math.max(maxY, m.bbox.y + m.bbox.h);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY,
  };
}

/**
 * Single-linkage clustering using Union-Find
 * Two hits belong to the same cluster if distance(centerA, centerB) <= eps
 */
function singleLinkageClustering(hits: LabelHit[], eps: number): LabelHit[][] {
  const n = hits.length;
  if (n === 0) return [];

  // Union-Find parent array
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootA] = rootB;
    }
  }

  // Connect all pairs within eps distance
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distance(hits[i].center, hits[j].center);
      if (d <= eps) {
        union(i, j);
      }
    }
  }

  // Group by root
  const groups = new Map<number, LabelHit[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const group = groups.get(root) || [];
    group.push(hits[i]);
    groups.set(root, group);
  }

  return Array.from(groups.values());
}

/**
 * Build clusters from label hits using deterministic rules
 * 
 * Clustering:
 * - eps = clamp(2.5 * median_label_h, min=80, max=400)
 * - Minimum cluster size: 2 label hits
 * 
 * Eligibility:
 * - Contains at least one Number label AND one Title label
 * - OR total label weight >= 6
 */
export function buildClusters(hits: LabelHit[]): LabelCluster[] {
  if (hits.length < 2) return [];

  // Compute eps
  const medianH = getMedianLabelHeight(hits);
  const eps = Math.max(80, Math.min(400, 2.5 * medianH));

  // Perform single-linkage clustering
  const groups = singleLinkageClustering(hits, eps);

  const clusters: LabelCluster[] = [];

  for (const members of groups) {
    if (members.length < 2) continue; // Minimum cluster size

    const hasNumber = members.some(m => m.label_type === 'number');
    const hasTitle = members.some(m => m.label_type === 'title');
    const totalWeight = members.reduce((sum, m) => sum + m.weight, 0);

    // Eligibility check
    const eligible = (hasNumber && hasTitle) || totalWeight >= 6;
    if (!eligible) continue;

    const bbox = computeClusterBBox(members);
    const area = Math.max(bbox.w * bbox.h, 1);
    const tightnessBonus = 1 / area;

    // Score calculation
    let score = 0;
    if (hasNumber && hasTitle) score += 10;
    score += totalWeight;
    score += 3 * tightnessBonus;

    clusters.push({
      members,
      bbox,
      score,
      has_number_label: hasNumber,
      has_title_label: hasTitle,
      tightness_bonus: tightnessBonus,
    });
  }

  return clusters;
}

/**
 * Select the best cluster using deterministic tiebreak ladder
 * 
 * Tie-break ladder (in order):
 * 1) has both number+title
 * 2) highest score
 * 3) tightest bbox (smallest area)
 * 4) highest (bbox_centroid_x + bbox_centroid_y) [bottom-right bias]
 */
export function selectBestCluster(clusters: LabelCluster[]): LabelCluster | null {
  if (clusters.length === 0) return null;

  // Sort by tiebreak ladder
  const sorted = [...clusters].sort((a, b) => {
    // 1) Has both number+title
    const aBoth = a.has_number_label && a.has_title_label ? 1 : 0;
    const bBoth = b.has_number_label && b.has_title_label ? 1 : 0;
    if (aBoth !== bBoth) return bBoth - aBoth;

    // 2) Highest score
    if (a.score !== b.score) return b.score - a.score;

    // 3) Tightest bbox (smallest area)
    const aArea = a.bbox.w * a.bbox.h;
    const bArea = b.bbox.w * b.bbox.h;
    if (aArea !== bArea) return aArea - bArea;

    // 4) Bottom-right bias (highest centroid sum)
    const aCentroid = (a.bbox.x + a.bbox.w / 2) + (a.bbox.y + a.bbox.h / 2);
    const bCentroid = (b.bbox.x + b.bbox.w / 2) + (b.bbox.y + b.bbox.h / 2);
    return bCentroid - aCentroid;
  });

  const selected = sorted[0];

  // Record why selected
  selected.why_selected = [
    selected.has_number_label && selected.has_title_label ? 'has_both_labels' : null,
    `score=${selected.score.toFixed(2)}`,
    `area=${(selected.bbox.w * selected.bbox.h).toFixed(0)}`,
  ].filter(Boolean).join(', ');

  return selected;
}

/**
 * Expand cluster bbox proportionally based on median label dimensions
 * 
 * pad_x = clamp(6 * median_label_w, min=250, max=1000)
 * pad_y = clamp(5 * median_label_h, min=200, max=800)
 */
export function expandClusterBBox(
  cluster: LabelCluster,
  renderW: number,
  renderH: number
): PxBBox {
  const medianW = cluster.members.length > 0
    ? cluster.members.reduce((sum, m) => sum + m.bbox.w, 0) / cluster.members.length
    : 100;
  const medianH = cluster.members.length > 0
    ? cluster.members.reduce((sum, m) => sum + m.bbox.h, 0) / cluster.members.length
    : 30;

  const padX = Math.max(250, Math.min(1000, 6 * medianW));
  const padY = Math.max(200, Math.min(800, 5 * medianH));

  const expanded: PxBBox = {
    x: Math.max(0, cluster.bbox.x - padX),
    y: Math.max(0, cluster.bbox.y - padY),
    w: Math.min(renderW, cluster.bbox.w + 2 * padX),
    h: Math.min(renderH, cluster.bbox.h + 2 * padY),
  };

  // Clamp to render bounds
  if (expanded.x + expanded.w > renderW) {
    expanded.w = renderW - expanded.x;
  }
  if (expanded.y + expanded.h > renderH) {
    expanded.h = renderH - expanded.y;
  }

  return expanded;
}
