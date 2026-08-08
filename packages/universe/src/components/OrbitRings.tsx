/// <reference types="@react-three/fiber" />
import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialBody } from "../types";

interface OrbitRingsProps {
  bodies: CelestialBody[];
  isAwakened: boolean;
}

export default function OrbitRings({ bodies, isAwakened }: OrbitRingsProps) {
  const groupRef = useRef<THREE.Group>(null!);

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.005;
    }
  });

  if (!isAwakened) return null;

  return (
    <group ref={groupRef}>
      {bodies.map((body) => {
        if (body.orbitRadius === 0) return null;

        const points: THREE.Vector3[] = [];
        const segments = 128;
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * Math.PI * 2;
          points.push(
            new THREE.Vector3(
              Math.cos(theta) * body.orbitRadius,
              Math.sin(theta * 2) * 0.4,
              Math.sin(theta) * body.orbitRadius
            )
          );
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
          color: body.color,
          transparent: true,
          opacity: 0.2,
        });
        const lineObj = new THREE.Line(geometry, material);

        return <primitive key={body.id} object={lineObj} />;
      })}
    </group>
  );
}
