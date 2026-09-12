/** Canonical appearance, taken from the semantic 3D renderer. Shared by both adapters. */
export const flowParticleStyle = {
  tailStart: -13, headEnd: 6, halfHeight: 6,
  coreVariance: 2.6, glowVariance: 17, glowStrength: .36,
  tailFalloff: 5, tailWidth: 3, tailStrength: .28,
  whiteMix: .32, alphaCutoff: .008,
} as const;
export function flowParticleSize(scale: number, reduced: boolean): number {
  return Math.max(.8, Math.min(1.2, Math.sqrt(scale))) * (reduced ? .8 : 1);
}
const f = (value: number) => Number.isInteger(value) ? value.toFixed(1) : String(value);
const p = flowParticleStyle;
export const flowParticleVertexOffset = `tangent * mix(${f(p.tailStart)}, ${f(p.headEnd)}, uv.x) + normal * (uv.y - .5) * ${f(p.halfHeight * 2)}`;
export const flowParticleFragmentShader = `
  varying vec2 particleUv; varying vec3 particleColor; varying float fade;
  void main() {
    vec2 p = vec2(mix(${f(p.tailStart)}, ${f(p.headEnd)}, particleUv.x), (particleUv.y - .5) * ${f(p.halfHeight * 2)});
    float core = exp(-dot(p, p) / ${f(p.coreVariance)});
    float glow = exp(-dot(p, p) / ${f(p.glowVariance)}) * ${f(p.glowStrength)};
    float tail = exp(p.x / ${f(p.tailFalloff)}) * exp(-p.y * p.y / ${f(p.tailWidth)}) * ${f(p.tailStrength)} * (1. - smoothstep(-1., 0., p.x));
    float alpha = (core + glow + tail) * fade;
    if (alpha < ${f(p.alphaCutoff)}) discard;
    gl_FragColor = vec4(mix(particleColor, vec3(1.), core * ${f(p.whiteMix)}), alpha);
    #include <colorspace_fragment>
  }
`;
