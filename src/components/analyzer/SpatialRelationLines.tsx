import { useEffect, useLayoutEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpatialFlowPath } from '../../analyzer/spatialFlow';

export interface SpatialRelationPath extends SpatialFlowPath { intensity?: number }

/** The same GPU lines and screen-sized arrowheads in every Analyzer 3D view. */
export function SpatialRelationLines({ paths }: { paths: readonly SpatialRelationPath[] }) {
  const { size } = useThree();
  const edgeAsset = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], arrowVertices: number[] = [], previous: number[] = [], corners: number[] = [], arrowColors: number[] = [];
    for (const path of paths) {
      const color = new THREE.Color(path.color).multiplyScalar(path.intensity ?? 1).toArray();
      for (let index = 1; index < path.points.length; index++) {
        const a = path.points[index - 1]!, b = path.points[index]!;
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z); colors.push(...color, ...color);
      }
      const a = path.points.at(-2)!, b = path.points.at(-1)!;
      for (const corner of [[0, 0], [-12, 5], [-12, -5]]) { arrowVertices.push(b.x, b.y, b.z); previous.push(a.x, a.y, a.z); corners.push(...corner); arrowColors.push(...color); }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .95, depthTest: false });
    const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false;
    const arrowGeometry = new THREE.BufferGeometry(); arrowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(arrowVertices, 3)); arrowGeometry.setAttribute('previous', new THREE.Float32BufferAttribute(previous, 3)); arrowGeometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2)); arrowGeometry.setAttribute('color', new THREE.Float32BufferAttribute(arrowColors, 3));
    const arrowMaterial = new THREE.ShaderMaterial({ vertexColors: true, depthTest: false, side: THREE.DoubleSide, uniforms: { viewport: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'attribute vec3 previous; attribute vec2 corner; uniform vec2 viewport; varying vec3 tint; void main(){tint=color; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); vec4 a=projectionMatrix*modelViewMatrix*vec4(previous,1.); vec2 d=(p.xy/p.w-a.xy/a.w)*viewport; d=length(d)>.0001?normalize(d):vec2(1.,0.); p.xy+=(d*corner.x+vec2(-d.y,d.x)*corner.y)*2./viewport*p.w; gl_Position=p;}',
      fragmentShader: 'varying vec3 tint; void main(){gl_FragColor=vec4(tint,1.);\n#include <colorspace_fragment>\n}' });
    const arrows = new THREE.Mesh(arrowGeometry, arrowMaterial); arrows.frustumCulled = false; arrows.renderOrder = 2;
    return { object, geometry, material, arrows, arrowGeometry, arrowMaterial };
  }, [paths]);
  useEffect(() => () => { edgeAsset.geometry.dispose(); edgeAsset.material.dispose(); edgeAsset.arrowGeometry.dispose(); edgeAsset.arrowMaterial.dispose(); }, [edgeAsset]);

  useLayoutEffect(() => { (edgeAsset.arrowMaterial.uniforms.viewport!.value as THREE.Vector2).set(size.width, size.height); }, [edgeAsset, size.width, size.height]);
  edgeAsset.material.name = 'analyzer-relation-lines';
  edgeAsset.arrowMaterial.name = 'analyzer-relation-arrows';
  return <><primitive object={edgeAsset.object} /><primitive object={edgeAsset.arrows} /></>;
}
