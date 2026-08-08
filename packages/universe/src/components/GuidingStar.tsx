/// <reference types="@react-three/fiber" />
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { generateRayTexture } from "../utils/textureGenerator";

interface GuidingStarProps {
  isAwakened: boolean;
  onAwaken: () => void;
}

export default function GuidingStar({ isAwakened, onAwaken }: GuidingStarProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const coronaRef = useRef<THREE.Mesh>(null!);
  const godRaysGroupRef = useRef<THREE.Group>(null!);
  const particlesRef = useRef<THREE.Points>(null!);
  const rayTexture = useMemo(() => generateRayTexture(), []);

  useFrame((state, delta) => {
    const time = state.clock.getElapsedTime();

    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.15;
      meshRef.current.rotation.z += delta * 0.08;
    }

    if (coronaRef.current) {
      const pulse = Math.sin(time * 2.2) * 0.12 + 1.25;
      coronaRef.current.scale.set(pulse, pulse, pulse);
    }

    if (godRaysGroupRef.current) {
      godRaysGroupRef.current.rotation.z += delta * 0.04;
    }

    if (particlesRef.current) {
      particlesRef.current.rotation.y += delta * 0.06;
      particlesRef.current.rotation.x += delta * 0.02;
    }
  });

  // Star stardust halo positions
  const particleCount = 200;
  const particlePositions = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const r = 2.2 + Math.random() * 3.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    return pos;
  }, []);

  return (
    <group position={[0, 0, 0]}>
      {/* Central Light Source */}
      <pointLight position={[0, 0, 0]} intensity={isAwakened ? 3.5 : 0.8} color="#38bdf8" distance={100} />
      <pointLight position={[0, 0, 0]} intensity={isAwakened ? 2.0 : 0.4} color="#f59e0b" distance={50} />

      {/* Outer Volumetric Corona Halo */}
      <mesh ref={coronaRef}>
        <sphereGeometry args={[2.5, 32, 32]} />
        <meshBasicMaterial
          color="#38bdf8"
          transparent
          opacity={isAwakened ? 0.35 : 0.15}
          blending={THREE.AdditiveBlending}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Soft God Rays — gradient-faded beams, not flat slabs */}
      <group ref={godRaysGroupRef}>
        {[0, Math.PI / 2, Math.PI / 4, (Math.PI * 3) / 4].map((angle, i) => (
          <mesh key={i} rotation={[0, 0, angle]}>
            <planeGeometry args={[1.6, 9]} />
            <meshBasicMaterial
              map={rayTexture}
              color="#7dd3fc"
              transparent
              opacity={isAwakened ? 0.18 : 0.04}
              blending={THREE.AdditiveBlending}
              side={THREE.DoubleSide}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* Rixie Core Intelligent Heart Mesh */}
      <mesh
        ref={meshRef}
        onClick={onAwaken}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <icosahedronGeometry args={[1.6, 5]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#38bdf8"
          emissiveIntensity={isAwakened ? 2.8 : 1.0}
          roughness={0.1}
          metalness={0.3}
        />
      </mesh>

      {/* Orbiting Stardust Particles */}
      <points ref={particlesRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particlePositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          color="#7dd3fc"
          transparent
          opacity={0.85}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}
