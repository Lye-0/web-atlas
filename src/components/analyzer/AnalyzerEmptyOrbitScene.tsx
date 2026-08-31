import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

type Vector3Tuple = [number, number, number];
type Vector2Tuple = [number, number];

interface OrbitProps {
  color: string;
  emissive: string;
  phase: number;
  precession: number;
  radius: Vector2Tuple;
  speed: number;
  sphereRadius: number;
  tilt: Vector3Tuple;
}

function Orbit({ color, emissive, phase, precession, radius, speed, sphereRadius, tilt }: OrbitProps) {
  const groupRef = useRef<THREE.Group>(null);
  const sphereRef = useRef<THREE.Mesh>(null);
  const line = useMemo(() => {
    const points = Array.from({ length: 129 }, (_, index) => {
      const angle = (index / 128) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * radius[0], Math.sin(angle) * radius[1], 0);
    });

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      depthWrite: false,
      opacity: 0.34,
      toneMapped: false,
      transparent: true,
    });
    return new THREE.Line(geometry, material);
  }, [color, radius]);
  const initialPosition = useMemo<Vector3Tuple>(() => [
    Math.cos(phase) * radius[0],
    Math.sin(phase) * radius[1],
    0,
  ], [phase, radius]);

  useEffect(() => () => {
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [line]);

  useFrame(({ clock }) => {
    const elapsed = clock.getElapsedTime();
    const group = groupRef.current;
    const sphere = sphereRef.current;
    if (!group || !sphere) return;

    const precessionTime = elapsed * precession + phase;
    group.rotation.x = tilt[0] + Math.sin(precessionTime) * 0.14;
    group.rotation.y = tilt[1] + Math.cos(precessionTime * 0.82) * 0.18;
    group.rotation.z = tilt[2] + elapsed * precession * 0.22;

    const orbitTime = elapsed * speed + phase;
    sphere.position.set(
      Math.cos(orbitTime) * radius[0],
      Math.sin(orbitTime) * radius[1],
      0,
    );
    sphere.rotation.x = elapsed * 0.45;
    sphere.rotation.y = elapsed * 0.62;
  });

  return (
    <group ref={groupRef} rotation={tilt}>
      <primitive object={line} />
      <mesh ref={sphereRef} position={initialPosition}>
        <sphereGeometry args={[sphereRadius, 24, 16]} />
        <meshPhysicalMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={0.35}
          roughness={0.28}
          metalness={0.02}
          clearcoat={0.45}
          clearcoatRoughness={0.2}
        />
        <mesh scale={1.7}>
          <sphereGeometry args={[sphereRadius, 16, 10]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.16}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
        <pointLight color={color} intensity={0.55} distance={0.7} decay={2} />
      </mesh>
    </group>
  );
}

function OrbitScene() {
  const sceneRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (!sceneRef.current) return;
    const elapsed = clock.getElapsedTime();
    sceneRef.current.rotation.y = Math.sin(elapsed * 0.16) * 0.12;
    sceneRef.current.rotation.x = -0.08 + Math.cos(elapsed * 0.13) * 0.05;
  });

  return (
    <>
      <ambientLight intensity={0.34} />
      <hemisphereLight args={['#e8fff7', '#07100d', 1.35]} />
      <directionalLight color="#f2fff9" intensity={4.4} position={[-3.5, 4.5, 5]} />
      <pointLight color="#e4b982" intensity={20} distance={9} decay={2} position={[3.4, -2.2, 3.8]} />
      <pointLight color="#87d7bd" intensity={12} distance={8} decay={2} position={[-3.2, 1.2, -2.8]} />

      <group ref={sceneRef} rotation={[-0.08, 0, 0]}>
        <Orbit
          color="#b8e8d6"
          emissive="#396f5c"
          phase={1.95}
          precession={0.19}
          radius={[2.3, 2.02]}
          speed={0.72}
          sphereRadius={0.16}
          tilt={[0.3, -0.24, -0.22]}
        />
        <Orbit
          color="#e7c58f"
          emissive="#7a4f22"
          phase={4.15}
          precession={0.14}
          radius={[2.05, 1.7]}
          speed={-0.52}
          sphereRadius={0.14}
          tilt={[1.02, 0.82, -0.42]}
        />
        <Orbit
          color="#9edbc6"
          emissive="#2f6c58"
          phase={5.45}
          precession={0.24}
          radius={[1.52, 1.28]}
          speed={0.94}
          sphereRadius={0.11}
          tilt={[1.18, -0.64, 0.34]}
        />

        <mesh>
          <sphereGeometry args={[0.075, 20, 14]} />
          <meshPhysicalMaterial
            color="#d8f5e9"
            emissive="#5fa88f"
            emissiveIntensity={0.22}
            roughness={0.18}
            clearcoat={1}
          />
        </mesh>
      </group>
    </>
  );
}

export default function AnalyzerEmptyOrbitScene({ reducedMotion }: { reducedMotion: boolean }) {
  return (
    <Canvas
      className="analyzer-empty-orbit-canvas"
      camera={{ fov: 36, near: 0.1, far: 30, position: [0, 0, 9.2] }}
      dpr={[1, 1.5]}
      frameloop={reducedMotion ? 'demand' : 'always'}
      gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}
    >
      <OrbitScene />
    </Canvas>
  );
}
