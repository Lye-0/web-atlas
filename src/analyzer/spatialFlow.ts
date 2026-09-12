export interface SpatialFlowPath {
  id: string;
  /** The exact ring centres of the rendered tube, in Three.js coordinates. */
  points: readonly { x: number; y: number; z: number }[];
  color: string;
}

export interface SpatialFlowState {
  distance: number;
  active: boolean;
  reduced: boolean;
}

export const SPATIAL_FLOW_SPEED = 65;
export const SPATIAL_FLOW_MAX_FRAME_SECONDS = .1;
export const SPATIAL_FLOW_PARTICLE_SPACING = 50;
export const SPATIAL_FLOW_PATHS_PER_BATCH = 512;

export function spatialFlowPhase(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Shared fixed arc spacing and phase for every renderer. */
export function buildSpatialFlowData(paths: readonly SpatialFlowPath[]) {
  const width = Math.max(2, ...paths.map(path => path.points.length));
  const height = Math.max(1, paths.length);
  const samples = new Float32Array(width * height * 4);
  const particles: { row: number; length: number; sampleCount: number; offset: number; index: number; color: string }[] = [];
  paths.forEach((path, row) => {
    let length = 0;
    path.points.forEach((point, i) => {
      const previous = path.points[i - 1];
      if (previous) length += Math.hypot(point.x - previous.x, point.y - previous.y, point.z - previous.z);
      samples.set([point.x, point.y, point.z, length], (row * width + i) * 4);
    });
    if (path.points.length < 2 || length < 0.001) return;
    const count = Math.ceil(length / SPATIAL_FLOW_PARTICLE_SPACING);
    const phase = spatialFlowPhase(path.id);
    for (let index = 0; index < count; index++) particles.push({
      row: (row + 0.5) / height, length, sampleCount: path.points.length,
      offset: phase, index, color: path.color,
    });
  });
  return { width, height, samples, particles };
}
