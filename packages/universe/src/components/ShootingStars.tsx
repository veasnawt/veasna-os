/// <reference types="@react-three/fiber" />
import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface MeteorData {
  startPos: THREE.Vector3;
  endPos: THREE.Vector3;
  speed: number;
  progress: number;
  active: boolean;
  delay: number;
}

export default function ShootingStars() {
  const count = 4;
  const linesRef = useRef<THREE.LineSegments>(null!);

  const meteors = useMemo<MeteorData[]>(() => {
    const list: MeteorData[] = [];
    for (let i = 0; i < count; i++) {
      const rx = (Math.random() - 0.5) * 120;
      const ry = 20 + Math.random() * 40;
      const rz = (Math.random() - 0.5) * 100;
      list.push({
        startPos: new THREE.Vector3(rx, ry, rz),
        endPos: new THREE.Vector3(rx - 30, ry - 30, rz - 20),
        speed: 0.8 + Math.random() * 0.8,
        progress: 0,
        active: false,
        delay: Math.random() * 8,
      });
    }
    return list;
  }, []);

  const positions = useMemo(() => new Float32Array(count * 6), [count]);

  useFrame((_, delta) => {
    meteors.forEach((m, idx) => {
      if (!m.active) {
        m.delay -= delta;
        if (m.delay <= 0) {
          m.active = true;
          m.progress = 0;
          m.delay = 6 + Math.random() * 10;
        }
      } else {
        m.progress += delta * m.speed;
        if (m.progress >= 1) {
          m.active = false;
        }
      }

      const head = new THREE.Vector3().lerpVectors(m.startPos, m.endPos, m.progress);
      const tailLength = 0.15;
      const tail = new THREE.Vector3().lerpVectors(
        m.startPos,
        m.endPos,
        Math.max(0, m.progress - tailLength)
      );

      const i6 = idx * 6;
      if (m.active) {
        positions[i6] = head.x;
        positions[i6 + 1] = head.y;
        positions[i6 + 2] = head.z;
        positions[i6 + 3] = tail.x;
        positions[i6 + 4] = tail.y;
        positions[i6 + 5] = tail.z;
      } else {
        positions[i6] = 0;
        positions[i6 + 1] = 0;
        positions[i6 + 2] = 0;
        positions[i6 + 3] = 0;
        positions[i6 + 4] = 0;
        positions[i6 + 5] = 0;
      }
    });

    if (linesRef.current) {
      linesRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  return (
    <lineSegments ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <lineBasicMaterial
        color="#e0f2fe"
        transparent
        opacity={0.85}
        blending={THREE.AdditiveBlending}
        linewidth={2}
      />
    </lineSegments>
  );
}
