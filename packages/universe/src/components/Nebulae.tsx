/// <reference types="@react-three/fiber" />
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import * as THREE from "three";
import { generateNebulaTexture } from "../utils/textureGenerator";

interface NebulaCluster {
  color: string;
  position: [number, number, number];
  puffs: { offset: [number, number, number]; scale: number; opacity: number }[];
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildCluster(color: string, position: [number, number, number], spread: number, seed: number): NebulaCluster {
  const rand = mulberry32(seed);
  const puffCount = 3 + Math.floor(rand() * 2);
  const puffs = Array.from({ length: puffCount }).map(() => ({
    offset: [
      (rand() - 0.5) * spread,
      (rand() - 0.5) * spread * 0.6,
      (rand() - 0.5) * spread,
    ] as [number, number, number],
    scale: 45 + rand() * 55,
    opacity: 0.22 + rand() * 0.16,
  }));
  return { color, position, puffs };
}

export default function Nebulae() {
  const groupRef = useRef<THREE.Group>(null!);

  const clusters = useMemo<NebulaCluster[]>(
    () => [
      buildCluster("#6366f1", [-45, 12, -55], 40, 1),
      buildCluster("#f59e0b", [48, -18, -65], 50, 2),
      buildCluster("#10b981", [-22, -28, -45], 35, 3),
      buildCluster("#38bdf8", [0, 4, -35], 30, 4),
    ],
    []
  );

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.004;
    }
  });

  return (
    <group ref={groupRef}>
      {clusters.map((cluster, ci) => {
        const texture = generateNebulaTexture(cluster.color);
        return (
          <group key={ci} position={cluster.position}>
            {cluster.puffs.map((puff, pi) => (
              <Billboard key={pi} position={puff.offset}>
                <mesh>
                  <planeGeometry args={[puff.scale, puff.scale]} />
                  <meshBasicMaterial
                    map={texture}
                    transparent
                    opacity={puff.opacity}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                  />
                </mesh>
              </Billboard>
            ))}
          </group>
        );
      })}
    </group>
  );
}
