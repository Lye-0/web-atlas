import { flowParticleSize, flowParticleStyle as profile } from '../../analyzer/flowParticleStyle';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { spatialFlowPhase, SPATIAL_FLOW_PARTICLE_SPACING, SPATIAL_FLOW_SPEED, SPATIAL_FLOW_MAX_FRAME_SECONDS } from '../../analyzer/spatialFlow';

interface Path { id: string; path: string; color: string; opacity?: number }
const sprites = new Map<string, string>();
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Rasterizes the same core/glow/tail profile as SpatialFlowParticles' fragment shader. */
function sprite(color: string, reduced: boolean) {
  const key = `${color}:${reduced}`;
  const cached = sprites.get(key); if (cached) return cached;
  const canvas = document.createElement('canvas'); canvas.width = (profile.headEnd - profile.tailStart) * 4; canvas.height = profile.halfHeight * 8;
  const context = canvas.getContext('2d'); if (!context) return '';
  const data = context.createImageData(canvas.width, canvas.height);
  const channels = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
    const px = profile.tailStart + (x + .5) / 4, py = -profile.halfHeight + (y + .5) / 4, radius = px * px + py * py;
    const core = Math.exp(-radius / profile.coreVariance), glow = Math.exp(-radius / profile.glowVariance) * profile.glowStrength;
    const tail = Math.exp(px / profile.tailFalloff) * Math.exp(-py * py / profile.tailWidth) * profile.tailStrength * (1 - smooth(-1, 0, px));
    const alpha = (core + glow + tail) * (reduced ? .7 : 1), offset = (y * canvas.width + x) * 4;
    channels.forEach((c, i) => { const v = c + (1 - c) * core * profile.whiteMix; data.data[offset + i] = Math.round(255 * (v <= .0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - .055)); });
    data.data[offset + 3] = alpha < profile.alphaCutoff ? 0 : Math.round(Math.min(1, alpha) * 255);
  }
  context.putImageData(data, 0, 0); const url = canvas.toDataURL(); sprites.set(key, url); return url;
}

/** SVG adapter for the 3D particle appearance; layout/routing remains renderer-owned. */
export function SvgFlowParticles({ paths, scale, enabled, visible, reduced }: {
  paths: readonly Path[]; scale: number; enabled: boolean; visible: boolean; reduced: boolean;
}) {
  const root = useRef<SVGGElement>(null);
  const distanceRef = useRef(0);
  const previousTime = useRef(0);
  const viewport = useRef<{ matrix: DOMMatrix; bounds: DOMRect } | undefined>(undefined);
  const geometryCache = useRef(new Map<string, { path: string; route: { id: string; length: number; samples: { x: number; y: number }[] } }>());
  const [geometry, setGeometry] = useState<{ id: string; length: number; samples: { x: number; y: number }[] }[]>([]);
  const active = enabled && visible;
  // Camera commits update the matrix; animation frames only read this snapshot.
  useLayoutEffect(() => {
    if (!active) { viewport.current = undefined; return; }
    const matrix = root.current?.getScreenCTM?.(), stage = root.current?.closest('.analyzer-graph-stage');
    viewport.current = matrix && stage ? { matrix, bounds: stage.getBoundingClientRect() } : undefined;
  });
  useLayoutEffect(() => {
    if (!active) { previousTime.current = 0; setGeometry(current => current.length ? [] : current); return; }
    const next = [...root.current?.querySelectorAll<SVGPathElement>('[data-particle-route]') ?? []].flatMap(path => {
      const id = path.dataset.particleRoute!, d = path.getAttribute('d')!;
      const cached = geometryCache.current.get(id); if (cached?.path === d) return [cached.route];
      if (!path.getTotalLength) return [];
      const length = path.getTotalLength(); if (length < .001) return [];
      const count = Math.min(4096, Math.max(2, Math.ceil(length / 4)));
      const route = { id, length, samples: Array.from({ length: count + 1 }, (_, i) => { const p = path.getPointAtLength(length * i / count); return { x: p.x, y: p.y }; }) };
      geometryCache.current.set(id, { path: d, route }); return [route];
    });
    const ids = new Set(next.map(route => route.id)); for (const id of geometryCache.current.keys()) if (!ids.has(id)) geometryCache.current.delete(id);
    setGeometry(current => current.length === next.length && current.every((route, i) => route === next[i]) ? current : next);
  }, [paths, active]);
  useEffect(() => {
    if (!active || !geometry.length) return;
    let frame = 0;
    const spacing = SPATIAL_FLOW_PARTICLE_SPACING * (reduced ? 2 : 1);
    const size = flowParticleSize(scale, reduced) / Math.max(.001, scale);
    const groups = geometry.map((route, owner) => ({ route, images: [...root.current?.querySelectorAll<SVGImageElement>(`[data-particle-owner="${owner}"]`) ?? []].map(image => ({ image, shown: true })) }));
    const paint = (time: number) => {
      if (previousTime.current) distanceRef.current += Math.min((time - previousTime.current) / 1000, SPATIAL_FLOW_MAX_FRAME_SECONDS) * SPATIAL_FLOW_SPEED;
      previousTime.current = time;
      for (const { route, images } of groups) images.forEach((slot, index) => {
        const { image } = slot;
        const travelled = (distanceRef.current + spatialFlowPhase(route.id) * spacing) % spacing + index * spacing;
        const t = Math.min(route.samples.length - 1.00001, travelled / route.length * (route.samples.length - 1));
        const lo = Math.floor(t), a = route.samples[lo]!, b = route.samples[lo + 1]!, f = t - lo;
        const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
        const clip = viewport.current;
        const sx = clip ? clip.matrix.a * x + clip.matrix.c * y + clip.matrix.e : 0;
        const sy = clip ? clip.matrix.b * x + clip.matrix.d * y + clip.matrix.f : 0;
        const shown = travelled <= route.length && (!clip || sx >= clip.bounds.left - 24 && sx <= clip.bounds.right + 24 && sy >= clip.bounds.top - 24 && sy <= clip.bounds.bottom + 24);
        if (shown !== slot.shown) { image.setAttribute('visibility', shown ? 'visible' : 'hidden'); slot.shown = shown; }
        if (!shown) return;
        image.setAttribute('transform', `translate(${x} ${y}) rotate(${Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI}) scale(${size})`);
        image.setAttribute('opacity', String(smooth(0, 8, travelled) * (1 - smooth(Math.max(0, route.length - 8), route.length, travelled))));
      });
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint); return () => cancelAnimationFrame(frame);
  }, [geometry, scale, reduced, active]);
  return <g ref={root} data-flow-layer="particles" pointerEvents="none" aria-hidden="true" style={{ mixBlendMode: 'plus-lighter' }}>
    {active && paths.map(path => <path key={path.id} data-particle-route={path.id} d={path.path} fill="none" stroke="none" />)}
    {active && geometry.map((route, owner) => { const path = paths.find(path => path.id === route.id); return path && <g key={route.id} opacity={path.opacity}>
      {Array.from({ length: Math.ceil(route.length / (SPATIAL_FLOW_PARTICLE_SPACING * (reduced ? 2 : 1))) }, (_, i) => <image key={i} data-flow-particle data-particle-owner={owner} data-particle-edge-id={route.id}
        href={sprite(path.color, reduced)} x={profile.tailStart} y={-profile.halfHeight} width={profile.headEnd - profile.tailStart} height={profile.halfHeight * 2} opacity={0} />)}
    </g>; })}
  </g>;
}
