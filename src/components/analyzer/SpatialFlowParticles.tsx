import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { buildSpatialFlowData, SPATIAL_FLOW_PATHS_PER_BATCH, type SpatialFlowPath, type SpatialFlowState } from '../../analyzer/spatialFlow';
import type { SpatialCameraModel } from '../../analyzer/spatialCoordinates';

function FlowBatch({ paths, stateRef, cameraRef }: {
  paths: readonly SpatialFlowPath[];
  stateRef: { current: SpatialFlowState };
  cameraRef: { current: SpatialCameraModel };
}) {
  const resources = useMemo(() => {
    const data = buildSpatialFlowData(paths);
    const texture = new THREE.DataTexture(data.samples, data.width, data.height, THREE.RGBAFormat, THREE.FloatType);
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    texture.needsUpdate = true;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setIndex(quad.index!.clone());
    geometry.setAttribute('position', quad.attributes.position!.clone());
    geometry.setAttribute('uv', quad.attributes.uv!.clone());
    quad.dispose();
    const info = new Float32Array(data.particles.length * 4);
    const offsets = new Float32Array(data.particles.length);
    const colors = new Float32Array(data.particles.length * 3);
    const color = new THREE.Color();
    data.particles.forEach((particle, i) => {
      info.set([particle.row, particle.length, particle.sampleCount, particle.index], i * 4);
      offsets[i] = particle.offset;
      colors.set(color.set(particle.color).toArray(), i * 3);
    });
    geometry.setAttribute('pathInfo', new THREE.InstancedBufferAttribute(info, 4));
    geometry.setAttribute('phaseOffset', new THREE.InstancedBufferAttribute(offsets, 1));
    geometry.setAttribute('flowColor', new THREE.InstancedBufferAttribute(colors, 3));
    geometry.instanceCount = data.particles.length;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        paths: { value: texture }, textureWidth: { value: data.width }, distance: { value: 0 },
        viewport: { value: new THREE.Vector2(1, 1) }, reduced: { value: 0 }, cameraScale: { value: 1 },
      },
      transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
      vertexShader: `
        uniform sampler2D paths; uniform float textureWidth; uniform float distance;
        uniform vec2 viewport; uniform float reduced; uniform float cameraScale;
        attribute vec4 pathInfo; attribute float phaseOffset; attribute vec3 flowColor;
        varying vec2 particleUv; varying vec3 particleColor; varying float fade;
        vec4 samplePath(float index) { return texture2D(paths, vec2((index + .5) / textureWidth, pathInfo.x)); }
        void main() {
          float progress = fract(distance / pathInfo.y + phaseOffset);
          float travelled = progress * pathInfo.y;
          // Binary search cumulative distance: match the tube's actual segment centres at uniform speed.
          float lo = 0.; float hi = pathInfo.z - 1.;
          for (int i = 0; i < 12; i++) {
            if (hi - lo <= 1.) break;
            float mid = floor((lo + hi) * .5);
            if (samplePath(mid).w <= travelled) lo = mid; else hi = mid;
          }
          vec4 a = samplePath(lo); vec4 b = samplePath(hi);
          float t = clamp((travelled - a.w) / max(.0001, b.w - a.w), 0., 1.);
          vec4 center = modelViewMatrix * vec4(mix(a.xyz, b.xyz, t), 1.);
          // Move beyond the tube's front radius without changing its projected centre.
          center.z += 1.5 / max(.18, cameraScale);
          vec4 clip = projectionMatrix * center;
          vec4 ca = projectionMatrix * modelViewMatrix * vec4(a.xyz, 1.);
          vec4 cb = projectionMatrix * modelViewMatrix * vec4(b.xyz, 1.);
          vec2 tangent = (cb.xy / cb.w - ca.xy / ca.w) * viewport;
          tangent /= max(.0001, length(tangent));
          vec2 normal = vec2(-tangent.y, tangent.x);
          float size = clamp(sqrt(cameraScale), .8, 1.2);
          vec2 offset = tangent * mix(-13., 6., uv.x) + normal * (uv.y - .5) * 12.;
          clip.xy += offset * size * mix(1., .8, reduced) * 2. / viewport * clip.w;
          gl_Position = clip;
          particleUv = uv; particleColor = flowColor;
          fade = smoothstep(0., .035, progress) * (1. - smoothstep(.965, 1., progress)) * mix(1., .7, reduced);
          if (reduced > .5 && mod(pathInfo.w, 2.) > .5) fade = 0.;
        }`,
      fragmentShader: `
        varying vec2 particleUv; varying vec3 particleColor; varying float fade;
        void main() {
          vec2 p = vec2(mix(-13., 6., particleUv.x), (particleUv.y - .5) * 12.);
          float core = exp(-dot(p, p) / 2.6);
          float glow = exp(-dot(p, p) / 17.) * .36;
          float tail = exp(p.x / 5.) * exp(-p.y * p.y / 3.) * .28 * (1. - smoothstep(-1., 0., p.x));
          float alpha = (core + glow + tail) * fade;
          if (alpha < .008) discard;
          gl_FragColor = vec4(mix(particleColor, vec3(1.), core * .32), alpha);
          #include <colorspace_fragment>
        }`,
    });
    return { geometry, material, texture };
  }, [paths]);
  useEffect(() => () => {
    resources.geometry.dispose(); resources.material.dispose(); resources.texture.dispose();
  }, [resources]);
  return <mesh geometry={resources.geometry} material={resources.material} frustumCulled={false} renderOrder={4}
    onBeforeRender={() => {
      resources.material.uniforms.distance!.value = stateRef.current.distance;
      resources.material.uniforms.reduced!.value = Number(stateRef.current.reduced);
      resources.material.uniforms.cameraScale!.value = cameraRef.current.scale;
      (resources.material.uniforms.viewport!.value as THREE.Vector2).set(cameraRef.current.viewportWidth, cameraRef.current.viewportHeight);
    }} />;
}

export function SpatialFlowParticles({ paths, stateRef, cameraRef, active }: {
  paths: readonly SpatialFlowPath[];
  stateRef: { current: SpatialFlowState };
  cameraRef: { current: SpatialCameraModel };
  active: boolean;
}) {
  const batches = useMemo(() => Array.from({ length: Math.ceil(paths.length / SPATIAL_FLOW_PATHS_PER_BATCH) }, (_, i) =>
    paths.slice(i * SPATIAL_FLOW_PATHS_PER_BATCH, (i + 1) * SPATIAL_FLOW_PATHS_PER_BATCH)), [paths]);
  return <group visible={active}>{batches.map((batch, i) => <FlowBatch key={i} paths={batch} stateRef={stateRef} cameraRef={cameraRef} />)}</group>;
}
