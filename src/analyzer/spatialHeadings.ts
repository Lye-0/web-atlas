import { projectSpatialPoint, type SpatialCameraModel, type SpatialWorldPoint, type SpatialWorldRect } from './spatialCoordinates';
import { projectWorldRect } from './spatialProjectedGraph';

export interface SpatialHeadingModel {
  id: string;
  anchor: SpatialWorldPoint;
  bounds: SpatialWorldRect;
  firstModuleTop?: SpatialWorldPoint;
  width: number;
}

export interface SpatialHeadingFrame {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  visible: boolean;
}

/** Scale every part of a heading together, with a readable floor and bounded near size. */
export function spatialHeadingScale(cameraScale: number): number {
  return Math.min(1.8, Math.max(0.7, Math.sqrt(cameraScale)));
}

/** Models are in semantic priority order. The same projection runs during input and at rest. */
export function projectSpatialHeadings(models: readonly SpatialHeadingModel[], camera: SpatialCameraModel): SpatialHeadingFrame[] {
  const scale = spatialHeadingScale(camera.scale);
  const cells = new Map<string, SpatialHeadingFrame[]>();
  const cellSize = 128;
  const clearance = 4 * scale;
  return models.map(model => {
    const anchor = projectSpatialPoint(model.anchor, camera);
    const bounds = projectWorldRect(model.bounds, camera);
    const firstTop = model.firstModuleTop ? projectSpatialPoint(model.firstModuleTop, camera).y : Infinity;
    const width = Math.max(0, Math.min(model.width * scale, bounds.x + bounds.width - anchor.x - 12 * camera.scale));
    const frame: SpatialHeadingFrame = {
      id: model.id, x: anchor.x, y: Math.min(anchor.y - 11 * scale, firstTop - 28 * scale),
      width, height: 24 * scale, scale,
      visible: width >= 80 * scale && bounds.height >= 28 * scale,
    };
    frame.visible &&= frame.x + width >= 0 && frame.y + frame.height >= 0
      && frame.x <= camera.viewportWidth && frame.y <= camera.viewportHeight;
    if (!frame.visible) return frame;

    // A screen grid limits overlap checks to neighbouring headings, even in large repositories.
    const keys: string[] = [];
    for (let x = Math.floor((frame.x - clearance) / cellSize); x <= Math.floor((frame.x + width + clearance) / cellSize); x++) {
      for (let y = Math.floor((frame.y - clearance) / cellSize); y <= Math.floor((frame.y + frame.height + clearance) / cellSize); y++) {
        const key = `${x}:${y}`;
        keys.push(key);
        if (cells.get(key)?.some(other => frame.x < other.x + other.width + clearance
          && frame.x + width + clearance > other.x && frame.y < other.y + other.height + clearance
          && frame.y + frame.height + clearance > other.y)) frame.visible = false;
      }
    }
    if (frame.visible) for (const key of keys) {
      const bucket = cells.get(key) ?? [];
      bucket.push(frame);
      cells.set(key, bucket);
    }
    return frame;
  });
}
