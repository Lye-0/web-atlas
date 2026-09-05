import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ANALYZER_MODULE_NODE_WIDTH, type PositionedNode, type PositionedSemanticRegion } from '../../analyzer/layout';
import { spatialModuleElevation, spatialRegionDepthElevation } from '../../analyzer/spatialPresentation';
import { projectSpatialPoint, type SpatialCameraModel, type SpatialWorldPoint } from '../../analyzer/spatialCoordinates';
import type { ProjectedGraphEdge } from '../../analyzer/spatialProjectedGraph';

const floorRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
function elevation(node: PositionedNode) {
  const path = node.node.metadata.regionPath;
  return spatialModuleElevation(Array.isArray(path) ? Math.max(0, path.length - 1) : 0);
}
function vector(point: SpatialWorldPoint) { return new THREE.Vector3(point.x, point.z, point.y); }
const edgeColors = { imports: '#82c6e2', 'imported-by': '#dfb785', internal: '#afcbbd' };
function connectionColor(edge: ProjectedGraphEdge) { return edgeColors[edge.direction ?? 'imports']; }

function tubeMaterial(outline: boolean) {
  return new THREE.ShaderMaterial({
    uniforms: { radius: { value: outline ? 2.8 : 1.1 } },
    side: outline ? THREE.BackSide : THREE.FrontSide,
    vertexShader: `uniform float radius; attribute vec3 center; attribute vec3 color;
      varying vec3 tubeColor; varying vec3 tubeNormal;
      void main() { tubeColor=color; tubeNormal=normalize(normalMatrix*normal);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(center+(position-center)*radius,1.0); }`,
    fragmentShader: `varying vec3 tubeColor; varying vec3 tubeNormal;
      void main() {
        vec3 n=normalize(tubeNormal);
        vec3 surface=tubeColor*(.72+.28*abs(n.z));
        ${outline ? 'surface=vec3(.004,.008,.006);' : 'surface+=vec3(.08)*pow(max(0.,dot(n,normalize(vec3(-.3,.6,1.)))),10.);'}
        gl_FragColor=vec4(surface,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Shared GPU geometry. DOM controls carry semantics, never paint over the 3D edges. */
function Modules({ modules, selectedId, connectedIds, search, directions, cameraRef }: {
  modules: readonly PositionedNode[]; selectedId?: string; connectedIds: ReadonlySet<string>; search: string;
  directions: ReadonlyMap<string, string>; cameraRef: { current: SpatialCameraModel };
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const resources = useMemo(() => {
    const geometry = new THREE.PlaneGeometry();
    geometry.setAttribute('plateColor', new THREE.InstancedBufferAttribute(new Float32Array(modules.length * 3), 3));
    geometry.setAttribute('rimColor', new THREE.InstancedBufferAttribute(new Float32Array(modules.length * 3), 3));
    const material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 1 } },
      vertexShader: `attribute vec3 plateColor; attribute vec3 rimColor;
        varying vec2 plateUv; varying vec3 face; varying vec3 rim;
        void main() { plateUv=uv; face=plateColor; rim=rimColor;
          gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float scale; varying vec2 plateUv; varying vec3 face; varying vec3 rim;
        void main() {
          vec2 q=abs((plateUv-.5)*vec2(150.,36.))-vec2(71.,14.);
          float d=length(max(q,0.))+min(max(q.x,q.y),0.)-4.;
          if(d>0.) discard;
          float border=1.-smoothstep(-1.15/max(scale,.4),-.2/max(scale,.4),d);
          vec3 surface=face*(.92+.12*plateUv.y);
          gl_FragColor=vec4(mix(rim,surface,border),1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return { geometry, material };
  }, [modules.length]);
  useEffect(() => () => { resources.geometry.dispose(); resources.material.dispose(); }, [resources]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4(); const color = new THREE.Color();
    const faces = resources.geometry.getAttribute('plateColor');
    const rims = resources.geometry.getAttribute('rimColor');
    modules.forEach((node, i) => {
      matrix.compose(new THREE.Vector3(node.x + ANALYZER_MODULE_NODE_WIDTH / 2, elevation(node), node.y + node.height / 2), floorRotation, new THREE.Vector3(ANALYZER_MODULE_NODE_WIDTH, node.height, 1));
      mesh.setMatrixAt(i, matrix);
      const selected = node.node.id === selectedId;
      const connected = connectedIds.has(node.node.id);
      const match = search.trim() && String(node.node.metadata.modulePath ?? node.node.label).toLowerCase().includes(search.toLowerCase());
      color.set(selected ? '#24474b' : match ? '#38352a' : connected ? '#223530' : '#192a25');
      faces.setXYZ(i, color.r, color.g, color.b);
      color.set(selected ? '#bfdfd3' : match ? '#dfb785' : connected ? directions.get(node.node.id) ?? '#769d8b' : '#466054');
      rims.setXYZ(i, color.r, color.g, color.b);
    });
    mesh.instanceMatrix.needsUpdate = true;
    faces.needsUpdate = true; rims.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [modules, selectedId, connectedIds, search, directions, resources]);
  return <instancedMesh key={modules.length} ref={ref} args={[resources.geometry, resources.material, modules.length]}
    onBeforeRender={() => { resources.material.uniforms.scale!.value = cameraRef.current.scale; }} />;
}

function Regions({ regions, selectedId }: { regions: readonly PositionedSemanticRegion[]; selectedId?: string }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const outline = useMemo(() => {
    const points: number[] = []; const colors: number[] = [];
    for (const item of regions) {
      const { x, y, width: w, height: h, region } = item;
      const z = spatialRegionDepthElevation(region.regionKind, region.depth) + .2;
      const color = new THREE.Color(region.id === selectedId ? '#a9d2bb' : region.regionKind === 'workspace-package' ? '#638b74' : '#496651');
      const corners = [[x,z,y],[x+w,z,y],[x+w,z,y+h],[x,z,y+h]];
      for(let i=0;i<4;i++) { points.push(...corners[i]!, ...corners[(i+1)%4]!); colors.push(...color.toArray(), ...color.toArray()); }
    }
    const geometry = new LineSegmentsGeometry(); geometry.setPositions(points); geometry.setColors(colors);
    const material = new LineMaterial({ linewidth: 1.25, vertexColors: true, depthWrite: false });
    return new LineSegments2(geometry, material);
  }, [regions, selectedId]);
  useEffect(() => () => { outline.geometry.dispose(); outline.material.dispose(); }, [outline]);
  useLayoutEffect(() => {
    if (!mesh.current) return;
    const matrix = new THREE.Matrix4(); const color = new THREE.Color();
    regions.forEach((item, i) => {
      const z = spatialRegionDepthElevation(item.region.regionKind, item.region.depth);
      matrix.compose(new THREE.Vector3(item.x + item.width/2, z, item.y + item.height/2), floorRotation, new THREE.Vector3(item.width, item.height, 1));
      mesh.current!.setMatrixAt(i, matrix);
      mesh.current!.setColorAt(i, color.set(item.region.id === selectedId ? '#1a3025' : item.region.regionKind === 'workspace-package' ? '#0d1a14' : (item.region.depth ?? 0) % 2 ? '#14241b' : '#18291f'));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true;
    mesh.current.computeBoundingSphere();
  }, [regions, selectedId]);
  return <><instancedMesh key={regions.length} ref={mesh} args={[undefined, undefined, regions.length]}><planeGeometry /><meshBasicMaterial /></instancedMesh><primitive object={outline}/></>;
}

const CELL_W = 256, CELL_H = 64, COLS = 8, PAGE_SIZE = COLS * 16;
function LabelPage({ modules, cameraRef }: { modules: readonly PositionedNode[]; cameraRef: { current: SpatialCameraModel } }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const resources = useMemo(() => {
    const rows = Math.max(1, Math.ceil(modules.length / COLS));
    const canvas = document.createElement('canvas'); canvas.width = CELL_W * COLS; canvas.height = CELL_H * rows;
    const ctx = canvas.getContext('2d')!;
    ctx.textBaseline = 'middle'; ctx.font = '500 22px system-ui, sans-serif';
    modules.forEach((item, i) => {
      const x = (i % COLS) * CELL_W, y = Math.floor(i / COLS) * CELL_H;
      ctx.strokeStyle = '#88a497'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.roundRect(x + 14, y + 22, 15, 20, 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 18, y + 29); ctx.lineTo(x + 25, y + 29); ctx.moveTo(x + 18, y + 34); ctx.lineTo(x + 25, y + 34); ctx.stroke();
      const text = item.node.label;
      let label = text;
      while(ctx.measureText(label).width > CELL_W - 54 && label.length > 8) {
        const keep = label.length - 2;
        label = text.slice(0, Math.ceil(keep*.65)) + '…' + text.slice(-Math.floor(keep*.35));
      }
      ctx.fillStyle = '#dce7df';
      ctx.fillText(label, x + 41, y + CELL_H / 2);
    });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry();
    const rects = new Float32Array(modules.length * 4);
    modules.forEach((_, i) => rects.set([(i % COLS) / COLS, 1 - (Math.floor(i/COLS)+1)/rows, 1/COLS, 1/rows], i*4));
    geometry.setAttribute('atlasRect', new THREE.InstancedBufferAttribute(rects,4));
    const material = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: texture }, detail: { value: 1 } }, transparent: true, depthWrite: false,
      vertexShader: 'attribute vec4 atlasRect; varying vec2 glyphUv; void main(){ glyphUv=atlasRect.xy+uv*atlasRect.zw; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D atlas; uniform float detail; varying vec2 glyphUv; void main(){ vec4 c=texture2D(atlas,glyphUv); if(c.a<0.1 || detail<0.5) discard; gl_FragColor=c;\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }',
    });
    return { geometry, material, texture };
  }, [modules]);
  useEffect(()=>()=>{resources.geometry.dispose();resources.material.dispose();resources.texture.dispose();},[resources]);
  useLayoutEffect(()=>{
    if(!ref.current)return;
    const matrix=new THREE.Matrix4();
    modules.forEach((item,i)=>{
      matrix.compose(new THREE.Vector3(item.x+ANALYZER_MODULE_NODE_WIDTH/2,elevation(item)+.3,item.y+item.height/2),floorRotation,new THREE.Vector3(ANALYZER_MODULE_NODE_WIDTH,item.height,1));
      ref.current!.setMatrixAt(i,matrix);
    });
    ref.current.instanceMatrix.needsUpdate=true;ref.current.computeBoundingSphere();
  },[modules]);
  // Screen footprint, not semantic selection, controls the text level of detail.
  useFrame(()=>{resources.material.uniforms.detail!.value = cameraRef.current.scale * (modules[0]?.height ?? 48) >= 18 ? 1 : 0;});
  // onBeforeRender also runs for the input loop's synchronous render.
  return <instancedMesh ref={ref} args={[resources.geometry,resources.material,modules.length]} onBeforeRender={()=>{resources.material.uniforms.detail!.value=cameraRef.current.scale*(modules[0]?.height??48)>=18?1:0;}} />;
}

function Edges({ edges, cameraRef }: { edges: readonly ProjectedGraphEdge[]; cameraRef: { current: SpatialCameraModel } }) {
  const arrows = useRef<THREE.InstancedMesh>(null);
  const resources = useMemo(()=>{
    const tubes: THREE.BufferGeometry[] = []; const shadows:number[]=[];
    const marks:{point:THREE.Vector3;direction:THREE.Vector3;color:THREE.Color}[]=[];
    for(const edge of edges){
      const color=new THREE.Color(connectionColor(edge));
      const points=edge.worldPoints.map(vector);
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const segments = points.length - 1;
      const geometry = new THREE.TubeGeometry(curve, segments, 1, 6, false);
      const centers = new Float32Array(geometry.attributes.position!.count * 3);
      const colors = new Float32Array(centers.length);
      for (let ring = 0; ring <= segments; ring++) {
        const point = curve.getPointAt(ring / segments);
        for (let side = 0; side <= 6; side++) {
          const index = (ring * 7 + side) * 3;
          centers.set(point.toArray(), index); colors.set(color.toArray(), index);
        }
      }
      geometry.setAttribute('center', new THREE.BufferAttribute(centers, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      tubes.push(geometry);
      for(let i=1;i<points.length;i++) {
        // A subdued ground projection makes the elevated span legible without lighting passes.
        for (const point of [points[i-1]!, points[i]!]) shadows.push(point.x + 3, 34.5, point.z + 4);
      }
      // True target terminal plus direction marks near both ends survive viewport clipping.
      const indices=[8,Math.max(9,points.length-9),points.length-1];
      for(const i of new Set(indices)){if(!points[i] || !points[i-1])continue; marks.push({point:points[i]!,direction:points[i]!.clone().sub(points[i-1]!).normalize(),color});}
    }
    const geometry = mergeGeometries(tubes)!;
    tubes.forEach(tube => tube.dispose());
    const material = tubeMaterial(false);
    // Back faces of a wider tube leave a continuous clearance at crossings.
    const halo = new THREE.Mesh(geometry, tubeMaterial(true));
    const shadowGeometry = new LineSegmentsGeometry(); shadowGeometry.setPositions(shadows);
    const shadow = new LineSegments2(shadowGeometry, new LineMaterial({ linewidth: 3, color: '#000000', transparent: true, opacity: .22, depthWrite: false }));
    shadow.renderOrder = 0; halo.renderOrder = 1;
    const line = new THREE.Mesh(geometry,material); line.renderOrder = 2;
    return { line, halo, shadow, marks };
  },[edges]);
  useEffect(()=>()=>{
    resources.line.geometry.dispose(); resources.line.material.dispose(); resources.halo.material.dispose();
    resources.shadow.geometry.dispose(); resources.shadow.material.dispose();
  },[resources]);
  const lastUpdate = useRef<{ resources: typeof resources; scale: number } | undefined>(undefined);
  const scratch = useMemo(()=>({matrix:new THREE.Matrix4(),rotation:new THREE.Quaternion(),axis:new THREE.Vector3(0,1,0),position:new THREE.Vector3(),size:new THREE.Vector3()}),[]);
  const updateArrows=useCallback(()=>{
    if(!arrows.current)return;
    const scale = cameraRef.current.scale;
    resources.line.material.uniforms.radius!.value = 1.05 / Math.max(.18, scale);
    resources.halo.material.uniforms.radius!.value = 2.7 / Math.max(.18, scale);
    if(lastUpdate.current?.resources === resources && lastUpdate.current.scale === scale)return;
    const colorsChanged=lastUpdate.current?.resources !== resources;
    const {matrix,rotation,axis,position}=scratch;
    const size=Math.min(18,8/Math.max(.25,cameraRef.current.scale));
    resources.marks.forEach((mark,i)=>{
      rotation.setFromUnitVectors(axis,mark.direction);
      matrix.compose(position.copy(mark.point).addScaledVector(mark.direction,-size/2),rotation,scratch.size.set(size*.4,size,size*.4));
      arrows.current!.setMatrixAt(i,matrix);
      if(colorsChanged)arrows.current!.setColorAt(i,mark.color);
    });
    arrows.current.instanceMatrix.needsUpdate=true;
    if(colorsChanged && arrows.current.instanceColor)arrows.current.instanceColor.needsUpdate=true;
    lastUpdate.current={resources,scale};
  }, [cameraRef, resources, scratch]);
  useLayoutEffect(updateArrows, [updateArrows]);
  return <><primitive object={resources.shadow}/><primitive object={resources.halo} onBeforeRender={updateArrows}/><primitive object={resources.line}/><instancedMesh key={resources.marks.length} ref={arrows} args={[undefined,undefined,resources.marks.length]} renderOrder={3} frustumCulled={false} onBeforeRender={updateArrows}><coneGeometry args={[1,1,6]}/><meshBasicMaterial/></instancedMesh></>;
}

export function SpatialAtlasScene({ regions, modules, edges, cameraRef, cameraModel, selectedNodeId, selectedRegionId, connectedIds, search }: {
  regions: readonly PositionedSemanticRegion[]; modules: readonly PositionedNode[]; edges: readonly ProjectedGraphEdge[];
  cameraRef: { current: SpatialCameraModel }; cameraModel: SpatialCameraModel; selectedNodeId?: string; selectedRegionId?: string; connectedIds: ReadonlySet<string>; search:string;
}) {
  const directions = useMemo(() => {
    const map = new Map<string, string>();
    for (const edge of edges) {
      map.set(edge.sourceId, connectionColor(edge));
      map.set(edge.targetId, connectionColor(edge));
    }
    return map;
  }, [edges]);
  const pages=useMemo(()=>Array.from({length:Math.ceil(modules.length/PAGE_SIZE)},(_,i)=>modules.slice(i*PAGE_SIZE,(i+1)*PAGE_SIZE)),[modules]);
  const visiblePages=useMemo(()=>pages.map((modules,id)=>({modules,id})).filter(page => {
    if(cameraModel.scale * (page.modules[0]?.height ?? 36) < 18)return false;
    return page.modules.some(item=>{
      const p=projectSpatialPoint({x:item.x+ANALYZER_MODULE_NODE_WIDTH/2,y:item.y+item.height/2,z:elevation(item)},cameraModel);
      return p.x > -300 && p.y > -300 && p.x < cameraModel.viewportWidth+300 && p.y < cameraModel.viewportHeight+300;
    });
  }),[pages,cameraModel]);
  return <>
    <color attach="background" args={['#050c09']}/>
    {regions.length>0 && <Regions regions={regions} selectedId={selectedRegionId}/>}
    <group visible={cameraModel.scale*(modules[0]?.height??36)>=3}><Modules modules={modules} selectedId={selectedNodeId} connectedIds={connectedIds} search={search} directions={directions} cameraRef={cameraRef}/></group>
    {visiblePages.map(page=><LabelPage key={page.id} modules={page.modules} cameraRef={cameraRef}/>)}
    {edges.length>0 && <Edges edges={edges} cameraRef={cameraRef}/>}
  </>;
}

