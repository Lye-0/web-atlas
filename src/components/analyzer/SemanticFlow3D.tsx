import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { AnalyzerViewSession } from '../../analyzer/session';
import { layoutSemanticFlow, semanticFlowEdgePaths } from '../../analyzer/semantic/flowPresentation';
import { SPATIAL_FLOW_SPEED, type SpatialFlowState } from '../../analyzer/spatialFlow';
import { SpatialFlowParticles } from './SpatialFlowParticles';
import type { SemanticFlowRenderProps } from './SemanticFlow2D';
import { bindSemanticFlowKeyboard } from './semanticFlowKeyboard';
import { FlowLabelLayer, projectSemanticFlowLabels, type FlowLabelContent, type FlowLabelPlacement } from './semanticFlowLabels';

type CameraState = NonNullable<AnalyzerViewSession['semanticCamera']>;
interface Props extends SemanticFlowRenderProps { camera?: CameraState; onCamera: (camera: CameraState) => void; onUnavailable: () => void }

function Scene({ graph, selectedIds, selectedEdgeId, matchIds, command, motion, camera: savedCamera, onCamera, onSelect, onClear, onUnavailable, onLabels }: Props & { onLabels: (labels: FlowLabelPlacement[]) => void }) {
  const { camera, gl, size, invalidate } = useThree();
  const controls = useRef<OrbitControls | null>(null);
  const callbacks = useRef({ onCamera, onSelect, onClear, onUnavailable, onLabels });
  useEffect(() => { callbacks.current = { onCamera, onSelect, onClear, onUnavailable, onLabels }; }, [onCamera, onSelect, onClear, onUnavailable, onLabels]);
  useEffect(() => () => callbacks.current.onLabels([]), []);
  const positions = useMemo(() => layoutSemanticFlow(graph, '3d'), [graph]);
  const paths = useMemo(() => semanticFlowEdgePaths(graph, positions, selectedIds, selectedEdgeId, '3d', true), [graph, positions, selectedIds, selectedEdgeId]);
  const flowPaths = useMemo(() => paths.map(path => ({ id: path.edge.id, color: path.color, points: path.points })), [paths]);
  const stateRef = useRef<SpatialFlowState>({ active: false, distance: 0, reduced: false });
  const cameraRef = useRef({ scale: 1, viewportWidth: size.width, viewportHeight: size.height });
  const lastCommand = useRef(command?.nonce);
  const initialized = useRef(false);
  const initialCamera = useRef(savedCamera);
  const labelDirty = useRef(true);
  useEffect(() => { labelDirty.current = true; invalidate(); }, [positions, selectedIds, matchIds, selectedEdgeId, size, invalidate]);
  useEffect(() => {
    stateRef.current.active = motion.enabled && motion.visible && flowPaths.length > 0;
    stateRef.current.reduced = motion.reduced; invalidate();
  }, [motion.enabled, motion.visible, motion.reduced, flowPaths, invalidate]);
  const connected = useMemo(() => new Set(paths.flatMap(path => [path.edge.source, path.edge.target])), [paths]);
  const nodeAsset = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], sizes: number[] = [];
    positions.forEach(point => {
      vertices.push(point.x, point.y, point.z);
      const selected = selectedIds.has(point.node.id), matching = matchIds.has(point.node.id);
      colors.push(...new THREE.Color(selected ? '#c0e9dc' : matching ? '#edcc94' : connected.has(point.node.id) ? '#8db7b4' : '#698d81').toArray());
      sizes.push(selected ? 13 : matching ? 8 : connected.has(point.node.id) ? 7 : 5);
    });
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setAttribute('nodeSize', new THREE.Float32BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      uniforms: { zoom: { value: 1 }, pixelRatio: { value: gl.getPixelRatio() } },
      vertexShader: 'attribute float nodeSize; uniform float zoom; uniform float pixelRatio; varying vec3 tint; void main(){ tint=color; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=nodeSize*pixelRatio*clamp(sqrt(zoom),.85,2.); }',
      fragmentShader: 'varying vec3 tint; void main(){float d=length(gl_PointCoord-.5)*2.; if(d>1.)discard; gl_FragColor=vec4(tint,1.-smoothstep(.65,1.,d));\n#include <colorspace_fragment>\n}' });
    const object = new THREE.Points(geometry, material); object.frustumCulled = false;
    return { object, geometry, material };
  }, [positions, selectedIds, matchIds, connected, gl]);
  useEffect(() => () => { nodeAsset.geometry.dispose(); nodeAsset.material.dispose(); }, [nodeAsset]);
  const edgeAsset = useMemo(() => {
    const vertices: number[] = [], colors: number[] = [], arrowVertices: number[] = [], previous: number[] = [], corners: number[] = [], arrowColors: number[] = [];
    for (const path of paths) {
      const color = new THREE.Color(path.color).toArray();
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
  const save = useCallback(() => {
    const control = controls.current; if (!control) return;
    callbacks.current.onCamera({ position: camera.position.toArray(), target: control.target.toArray(), zoom: (camera as THREE.OrthographicCamera).zoom });
  }, [camera]);
  useEffect(() => {
    const control = new OrbitControls(camera, gl.domElement); controls.current = control;
    control.enableDamping = false; control.screenSpacePanning = true; control.minZoom = .000001; control.maxZoom = 8;
    control.mouseButtons.LEFT = THREE.MOUSE.ROTATE; control.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    gl.domElement.tabIndex = 0; gl.domElement.setAttribute('aria-label', '一覧3D。ドラッグで回転、右ドラッグで移動。検索結果からも選択できます。');
    control.listenToKeyEvents(gl.domElement);
    const unbindKeyboard = bindSemanticFlowKeyboard(gl.domElement, () => callbacks.current.onClear());
    const change = () => { labelDirty.current = true; invalidate(); };
    control.addEventListener('change', change); control.addEventListener('end', save);
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onUnavailable(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => { unbindKeyboard(); gl.domElement.removeEventListener('webglcontextlost', lost); control.dispose(); controls.current = null; };
  }, [camera, gl, invalidate, save]);
  const fit = useCallback((ids?: string[], reset = false) => {
    const control = controls.current; if (!control) return;
    const targets = ids?.length ? positions.filter(point => ids.includes(point.node.id)) : positions;
    if (!targets.length) return;
    const targetIds = new Set(targets.map(point => point.node.id));
    const fitPoints = [...targets, ...(!ids || ids.length > 1 ? paths.filter(path => !ids || targetIds.has(path.edge.source) && targetIds.has(path.edge.target)).flatMap(path => path.points) : [])];
    const box = new THREE.Box3().setFromPoints(fitPoints.map(point => new THREE.Vector3(point.x, point.y, point.z)));
    const center = box.getCenter(new THREE.Vector3());
    const direction = reset ? new THREE.Vector3(1, .65, 1.5).normalize() : camera.position.clone().sub(control.target).normalize();
    control.target.copy(center); camera.position.copy(center).addScaledVector(direction, Math.max(2000, box.getSize(new THREE.Vector3()).length() * 2)); control.update(); camera.updateMatrixWorld();
    const projected = fitPoints.map(point => new THREE.Vector3(point.x, point.y, point.z).applyMatrix4(camera.matrixWorldInverse));
    const viewBox = new THREE.Box3().setFromPoints(projected).getSize(new THREE.Vector3());
    const cam = camera as THREE.OrthographicCamera;
    cam.zoom = Math.min((size.width - 70) / (viewBox.x + 80), (size.height - 160) / (viewBox.y + 80), ids?.length === 1 ? 3 : 2);
    cam.updateProjectionMatrix(); control.update(); labelDirty.current = true; save(); invalidate();
  }, [positions, paths, camera, size, save, invalidate]);
  useEffect(() => {
    if (initialized.current || !positions.length || !controls.current) return;
    initialized.current = true;
    if (initialCamera.current) {
      const saved = initialCamera.current, cam = camera as THREE.OrthographicCamera;
      camera.position.fromArray(saved.position); controls.current.target.fromArray(saved.target); cam.zoom = saved.zoom; cam.updateProjectionMatrix(); controls.current.update(); invalidate();
    } else fit(undefined, true);
  }, [positions, camera, fit, invalidate]);
  useEffect(() => {
    if (!command || command.nonce === lastCommand.current) return;
    lastCommand.current = command.nonce;
    if (command.kind === 'fit' || command.kind === 'reset') fit(undefined, command.kind === 'reset');
    else if (command.kind === 'focus') fit(command.ids);
    else { const cam = camera as THREE.OrthographicCamera; cam.zoom = Math.max(.000001, Math.min(8, cam.zoom * (command.kind === 'zoom-in' ? 1.2 : 1 / 1.2))); cam.updateProjectionMatrix(); controls.current?.update(); labelDirty.current = true; save(); invalidate(); }
  }, [command, camera, fit, save, invalidate]);
  useEffect(() => {
    const element = gl.domElement; let down = { x: 0, y: 0 };
    const start = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; element.focus({ preventScroll: true }); };
    const end = (event: PointerEvent) => {
      if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
      const rect = element.getBoundingClientRect(), point = new THREE.Vector3();
      let nearest: { id: string; distance: number; depth: number } | undefined;
      for (const item of positions) {
        point.set(item.x, item.y, item.z).project(camera);
        const distance = Math.hypot((point.x + 1) * rect.width / 2 - event.clientX + rect.left, (1 - point.y) * rect.height / 2 - event.clientY + rect.top);
        if (point.z >= -1 && point.z <= 1 && distance <= 13 && (!nearest || distance < nearest.distance - 1 || Math.abs(distance - nearest.distance) < 1 && point.z < nearest.depth)) nearest = { id: item.node.id, distance, depth: point.z };
      }
      if (nearest) callbacks.current.onSelect(nearest.id); else callbacks.current.onClear();
    };
    element.addEventListener('pointerdown', start); element.addEventListener('pointerup', end);
    return () => { element.removeEventListener('pointerdown', start); element.removeEventListener('pointerup', end); };
  }, [camera, gl, positions]);
  const labelOrder = useMemo(() => [...positions].sort((a, b) => Number(selectedIds.has(b.node.id)) - Number(selectedIds.has(a.node.id)) || Number(matchIds.has(b.node.id)) - Number(matchIds.has(a.node.id)) || Number(connected.has(b.node.id)) - Number(connected.has(a.node.id)) || Number(b.node.kind === 'entry') - Number(a.node.kind === 'entry')), [positions, selectedIds, matchIds, connected]);
  useFrame((_, delta) => {
    const zoom = (camera as THREE.OrthographicCamera).zoom;
    nodeAsset.material.uniforms.zoom!.value = zoom;
    (edgeAsset.arrowMaterial.uniforms.viewport!.value as THREE.Vector2).set(size.width, size.height);
    cameraRef.current = { scale: zoom, viewportWidth: size.width, viewportHeight: size.height };
    if (labelDirty.current) {
      callbacks.current.onLabels(projectSemanticFlowLabels(camera, size, zoom, labelOrder, selectedIds, matchIds));
      labelDirty.current = false;
    }
    if (stateRef.current.active) { stateRef.current.distance += Math.min(delta, .1) * SPATIAL_FLOW_SPEED; invalidate(); }
  });
  return <><color attach="background" args={['#050c09']} /><primitive object={edgeAsset.object} /><primitive object={edgeAsset.arrows} /><primitive object={nodeAsset.object} />
    <SpatialFlowParticles paths={flowPaths} stateRef={stateRef} cameraRef={cameraRef} active={motion.enabled && motion.visible} />
  </>;
}

class FlowGraphBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? <p role="status">3Dを利用できないため、分類2Dへ戻ります。</p> : this.props.children; }
}

export function SemanticFlow3D(props: Props) {
  const [labels, setLabels] = useState<FlowLabelContent[]>([]);
  const [labelLayer] = useState(() => new FlowLabelLayer(setLabels));
  useLayoutEffect(() => { labelLayer.resume(); return () => labelLayer.suspend(); }, [labelLayer]);
  return <div className="semantic-flow-3d" data-node-count={props.graph.nodes.length} data-edge-count={props.graph.edges.length}>
    <FlowGraphBoundary onUnavailable={props.onUnavailable}><Canvas orthographic frameloop="demand" dpr={[1, 1.7]} camera={{ position: [900, 650, 1500], zoom: 1, near: .1, far: 1000000 }} gl={{ antialias: true, alpha: true }}><Scene {...props} onLabels={labelLayer.update} /></Canvas></FlowGraphBoundary>
    <div className="semantic-flow-3d-labels">{labels.map(label => <button key={label.id} ref={element => labelLayer.attach(label.id, element)} type="button"
      className={`${label.selected ? 'is-selected' : ''}${label.match ? ' is-match' : ''}`} aria-pressed={label.selected} title={`${label.label}\n${label.path}`}
      onClick={() => props.onSelect(label.id)}><strong>{label.label}</strong>{label.selected && <small>{label.path}</small>}</button>)}</div>
    <div className="semantic-flow-3d-selection-description" aria-live="polite">{[...props.selectedIds].map(id => props.graph.nodes.find(node => node.id === id)?.label).filter(Boolean).join('、')}</div>
  </div>;
}
