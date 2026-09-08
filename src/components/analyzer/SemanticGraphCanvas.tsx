import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { layoutSemanticGraph } from '../../analyzer/semantic/presentation';
import type { SemanticGraph, SemanticKind } from '../../analyzer/semantic/types';
import type { AnalyzerViewSession } from '../../analyzer/session';
import { registerCanvasDisposal, useCanvasDisposals } from './canvasDisposals';

type CameraState = NonNullable<AnalyzerViewSession['semanticCamera']>;
interface Props {
  graph: SemanticGraph; selected?: string; orbit: boolean; focus: number; fit: number;
  camera?: CameraState; onCamera: (camera: CameraState) => void; onSelect: (id: string) => void;
}
const palette: Record<SemanticKind, string> = { function: '#497869', entry: '#447fb1', request: '#9172b3', operation: '#ad7643', value: '#4b8293', model: '#817243', resource: '#a65c65', subsystem: '#546f91', external: '#898482', span: '#3c9485', log: '#85867a' };

function Scene({ graph, selected, orbit, focus, fit, camera: savedCamera, onCamera, onSelect, canvasDisposals }: Props & { canvasDisposals: Set<() => void> }) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const callbacks = useRef({ onCamera, onSelect });
  useEffect(() => { callbacks.current = { onCamera, onSelect }; }, [onCamera, onSelect]);
  const positions = useMemo(() => layoutSemanticGraph(graph, orbit), [graph, orbit]);
  const initialCamera = useRef<CameraState | undefined>(savedCamera);
  const asset = useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = Math.max(128, Math.ceil(positions.length / 4) * 128);
    const ctx = canvas.getContext('2d')!;
    const vertices: number[] = [], corners: number[] = [], uv: number[] = [], colors: number[] = [];
    positions.forEach(({ node, x, y, z }, index) => {
      const cx = index % 4 * 512, cy = Math.floor(index / 4) * 128;
      ctx.fillStyle = node.id === selected ? '#233b34' : '#14201f'; ctx.fillRect(cx + 2, cy + 2, 508, 124);
      ctx.strokeStyle = node.id === selected ? '#acdcca' : '#3d5350'; ctx.lineWidth = node.id === selected ? 5 : 2; ctx.strokeRect(cx + 3, cy + 3, 506, 122);
      ctx.fillStyle = palette[node.kind]; ctx.fillRect(cx + 3, cy + 3, 7, 122);
      ctx.font = '600 25px system-ui'; ctx.fillStyle = '#e5efea';
      const trim = (text: string, width: number) => { let result = text; while (ctx.measureText(result).width > width && result.length > 1) result = result.slice(0, -1); return result.length < text.length ? `${result.slice(0, -1)}…` : result; };
      ctx.fillText(trim(node.label, 458), cx + 23, cy + 41);
      ctx.font = '18px system-ui'; ctx.fillStyle = '#a1b3aa';
      ctx.fillText(trim(node.fields?.length ? node.fields.slice(0, 3).map(field => field.name).join(' · ') : node.path?.split('/').at(-1) ?? node.group, 458), cx + 23, cy + 76);
      ctx.font = '15px system-ui'; ctx.fillStyle = '#8db4a2';
      ctx.fillText(`${node.kind.toUpperCase()}${Array.isArray(node.attributes.members) ? ` · ${node.attributes.members.length} objects` : node.line ? ` · L${node.line}` : ''}`, cx + 23, cy + 105);
      const color = new THREE.Color(palette[node.kind]);
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        vertices.push(x, y, z); corners.push((u! - .5) * 208, (v! - .5) * 64); colors.push(color.r, color.g, color.b);
        uv.push((cx + u! * 512) / canvas.width, 1 - (cy + (1 - v!) * 128) / canvas.height);
      }
    });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('corner', new THREE.Float32BufferAttribute(corners, 2)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
    const material = new THREE.ShaderMaterial({ uniforms: { atlas: { value: texture }, detail: { value: 1 } }, transparent: true, depthTest: false,
      vertexShader: 'attribute vec2 corner; attribute vec3 tint; varying vec2 vUv; varying vec3 vTint; void main(){vUv=uv; vTint=tint; vec4 p=modelViewMatrix*vec4(position,1.); p.xy+=corner; gl_Position=projectionMatrix*p;}',
      fragmentShader: 'uniform sampler2D atlas; uniform float detail; varying vec2 vUv; varying vec3 vTint; void main(){vec4 t=texture2D(atlas,vUv); gl_FragColor=vec4(mix(mix(vec3(.1),vTint,.5),t.rgb,detail),t.a);\n#include <colorspace_fragment>\n}' });
    const mesh = new THREE.Mesh(geometry, material); mesh.frustumCulled = false; mesh.renderOrder = 2;
    mesh.onBeforeRender = (_renderer, _scene, activeCamera) => { material.uniforms.detail!.value = (activeCamera as THREE.OrthographicCamera).zoom < .25 ? 0 : 1; };
    return { mesh, material, texture, geometry };
  }, [positions, selected]);
  useEffect(() => () => { asset.texture.dispose(); asset.geometry.dispose(); asset.material.dispose(); }, [asset]);
  const edgeAsset = useMemo(() => {
    const byId = new Map(positions.map(position => [position.node.id, position])); const points: number[] = [], colors: number[] = [], other: number[] = [], offsets: number[] = [], loops: number[] = [];
    for (const edge of graph.edges) {
      const a = byId.get(edge.source), b = byId.get(edge.target); if (!a || !b) continue;
      const color = new THREE.Color(selected && (edge.source === selected || edge.target === selected) ? '#6ee7bc' : edge.confidence === 'observed' ? '#52aeb0' : '#48635d');
      if (a === b) {
        for (const [x, y] of [[108, 0], [145, 0], [145, 0], [145, 60], [145, 60], [0, 60], [0, 60], [0, 36], [-5, 47], [0, 36], [5, 47], [0, 36]]) { points.push(a.x, a.y, a.z); other.push(a.x, a.y, a.z); offsets.push(x!, y!); loops.push(1); colors.push(color.r, color.g, color.b); }
      } else {
        for (const [point, neighbour, along, across] of [[a, b, 4, 0], [b, a, 4, 0], [b, a, 17, 6], [b, a, 4, 0], [b, a, 17, -6], [b, a, 4, 0]] as const) { points.push(point.x, point.y, point.z); other.push(neighbour.x, neighbour.y, neighbour.z); offsets.push(along, across); loops.push(0); colors.push(color.r, color.g, color.b); }
      }
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3)); geometry.setAttribute('tint', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('other', new THREE.Float32BufferAttribute(other, 3)); geometry.setAttribute('offset', new THREE.Float32BufferAttribute(offsets, 2)); geometry.setAttribute('loop', new THREE.Float32BufferAttribute(loops, 1));
    const material = new THREE.ShaderMaterial({ transparent: true, depthTest: false,
      vertexShader: 'attribute vec3 other; attribute vec3 tint; attribute vec2 offset; attribute float loop; varying vec3 vTint; void main(){vTint=tint; vec4 p=modelViewMatrix*vec4(position,1.); vec4 q=modelViewMatrix*vec4(other,1.); if(loop>.5){p.xy+=offset;}else{vec2 d=q.xy-p.xy; d=length(d)>.001?normalize(d):vec2(0.,1.); float boundary=1./max(abs(d.x)/104.,abs(d.y)/32.); p.xy+=d*(boundary+offset.x)+vec2(-d.y,d.x)*offset.y;} gl_Position=projectionMatrix*p;}',
      fragmentShader: 'varying vec3 vTint; void main(){gl_FragColor=vec4(vTint,.85);\n#include <colorspace_fragment>\n}' });
    const object = new THREE.LineSegments(geometry, material); object.frustumCulled = false;
    return { object, geometry, material };
  }, [positions, graph.edges, selected]);
  useEffect(() => () => { edgeAsset.geometry.dispose(); edgeAsset.material.dispose(); }, [edgeAsset]);
  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement); controls.current = control;
    control.enableRotate = orbit; control.enableDamping = false; control.screenSpacePanning = true; control.minZoom = .025; control.maxZoom = 5;
    control.mouseButtons.LEFT = orbit ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN; control.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    control.touches.ONE = orbit ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN; control.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', 'グラフを操作。矢印キーで移動'); control.listenToKeyEvents(gl.domElement);
    const change = () => { invalidate(); };
    const end = () => callbacks.current.onCamera({ position: camera.position.toArray(), target: control.target.toArray(), zoom: (camera as THREE.OrthographicCamera).zoom });
    control.addEventListener('change', change); control.addEventListener('end', end);
    return registerCanvasDisposal(canvasDisposals, () => { control.removeEventListener('change', change); control.removeEventListener('end', end); control.dispose(); controls.current = null; });
  }, [camera, gl, invalidate, orbit, canvasDisposals]);
  useEffect(() => {
    const control = controls.current; if (!control) return;
    const cam = camera as THREE.OrthographicCamera;
    const state = initialCamera.current;
    if (state && fit === 0) { cam.position.fromArray(state.position); control.target.fromArray(state.target); cam.zoom = state.zoom; initialCamera.current = undefined; }
    else {
      const box = new THREE.Box3().setFromPoints(positions.map(point => new THREE.Vector3(point.x, point.y, point.z)));
      const center = positions.length ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3();
      const extent = positions.length ? box.getSize(new THREE.Vector3()) : new THREE.Vector3(300, 200, 0);
      control.target.copy(center); cam.position.copy(center).add(new THREE.Vector3(orbit ? 250 : 0, orbit ? 200 : 0, 1800));
      cam.zoom = Math.min(size.width / (extent.x + 360), size.height / (extent.y + 220), 1.4);
    }
    cam.updateProjectionMatrix(); control.update(); callbacks.current.onCamera({ position: cam.position.toArray(), target: control.target.toArray(), zoom: cam.zoom }); invalidate();
  }, [camera, positions, orbit, fit, size.width, size.height, invalidate]);
  useEffect(() => {
    if (!focus || !selected || !controls.current) return;
    const point = positions.find(item => item.node.id === selected); if (!point) return;
    const control = controls.current; const delta = new THREE.Vector3(point.x, point.y, point.z).sub(control.target);
    camera.position.add(delta); control.target.add(delta); (camera as THREE.OrthographicCamera).zoom = 1.25; camera.updateProjectionMatrix(); control.update(); callbacks.current.onCamera({ position: camera.position.toArray(), target: control.target.toArray(), zoom: 1.25 }); invalidate();
  }, [focus, selected, positions, camera, invalidate]);
  useEffect(() => {
    const element = gl.domElement; let down = { x: 0, y: 0 };
    const start = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; element.focus({ preventScroll: true }); };
    const end = (event: PointerEvent) => {
      if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const rect = element.getBoundingClientRect(); const zoom = (camera as THREE.OrthographicCamera).zoom;
      const hits = positions.map(item => ({ ...item, p: new THREE.Vector3(item.x, item.y, item.z).project(camera) })).filter(item => Math.abs((item.p.x + 1) * rect.width / 2 - (event.clientX - rect.left)) <= 104 * zoom && Math.abs((1 - item.p.y) * rect.height / 2 - (event.clientY - rect.top)) <= 32 * zoom).sort((a, b) => a.p.z - b.p.z);
      if (hits[0]) callbacks.current.onSelect(hits[0].node.id);
    };
    element.addEventListener('pointerdown', start); element.addEventListener('pointerup', end);
    return () => { element.removeEventListener('pointerdown', start); element.removeEventListener('pointerup', end); };
  }, [camera, gl, positions]);
  return <><primitive object={edgeAsset.object} /><primitive object={asset.mesh} /></>;
}

class GraphBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="semantic-empty-result"><h3>グラフ描画を利用できません</h3><p>このブラウザではWebGLを開始できませんでした。一覧から要素を選ぶと、関係と根拠を確認できます。</p></div> : this.props.children; }
}

export function SemanticGraphCanvas(props: Props) {
  const canvasDisposals = useCanvasDisposals();
  return <div className="semantic-canvas" role="img" aria-label={`${props.graph.nodes.length} objects、${props.graph.edges.length} relationsのグラフ。左の一覧からも選択できます。`}>
    <GraphBoundary><Canvas orthographic frameloop="demand" dpr={[1, 1.7]} camera={{ position: [0, 0, 1800], zoom: 1, near: .1, far: 30000 }} gl={{ antialias: true, alpha: true }}><Scene {...props} canvasDisposals={canvasDisposals} /></Canvas></GraphBoundary>
  </div>;
}
