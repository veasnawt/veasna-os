/// <reference types="@react-three/fiber" />
import React, { useRef, useState, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CelestialBody } from "../types";
import { generatePlanetTexture, generateCloudTexture } from "../utils/textureGenerator";

interface CelestialPlanetProps {
  body: CelestialBody;
  isSelected: boolean;
  onSelect: (body: CelestialBody) => void;
  isAwakened: boolean;
}

export default function CelestialPlanet({
  body,
  isSelected,
  onSelect,
  isAwakened,
}: CelestialPlanetProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const meshRef = useRef<THREE.Mesh>(null!);
  const cloudsRef = useRef<THREE.Mesh>(null!);
  const ringRef = useRef<THREE.Mesh>(null!);
  const [hovered, setHovered] = useState(false);

  // Orbit angle over time
  const angleRef = useRef<number>(Math.random() * Math.PI * 2);

  // Generate procedural textures once per planet
  const { map, bumpMap, emissiveMap } = useMemo(() => {
    const pType = (["bp", "art", "music", "gamedev", "memory"].includes(body.id)
      ? body.id
      : "bp") as "bp" | "art" | "music" | "gamedev" | "memory";
    return generatePlanetTexture(pType);
  }, [body.id]);

  const cloudTexture = useMemo(() => generateCloudTexture(), []);

  useFrame((_, delta) => {
    if (!isAwakened) return;

    // Advance orbit angle along gravitational path
    angleRef.current += delta * body.orbitSpeed * 0.3;
    const x = Math.cos(angleRef.current) * body.orbitRadius;
    const z = Math.sin(angleRef.current) * body.orbitRadius;
    const y = Math.sin(angleRef.current * 2) * 0.4;

    if (groupRef.current) {
      groupRef.current.position.set(x, y, z);
    }

    if (meshRef.current) {
      meshRef.current.rotation.y += delta * body.rotationSpeed * 3;
    }

    if (cloudsRef.current) {
      cloudsRef.current.rotation.y += delta * body.rotationSpeed * 4.2;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.03;
    }
  });

  if (!isAwakened) return null;

  return (
    <group ref={groupRef} position={body.position}>
      {/* Outer Atmospheric Scattering Rim Glow */}
      <mesh scale={hovered || isSelected ? 1.25 : 1.15}>
        <sphereGeometry args={[body.size, 32, 32]} />
        <meshBasicMaterial
          color={body.glowColor}
          transparent
          opacity={hovered || isSelected ? 0.35 : 0.16}
          blending={THREE.AdditiveBlending}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Main Handcrafted PBR Planet Mesh */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(body);
        }}
        onPointerOver={() => {
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "auto";
        }}
      >
        <sphereGeometry args={[body.size, 64, 64]} />
        <meshStandardMaterial
          map={map}
          bumpMap={bumpMap}
          bumpScale={0.08}
          emissiveMap={emissiveMap}
          emissive={body.color}
          emissiveIntensity={isSelected ? 0.5 : hovered ? 0.35 : 0.2}
          roughness={0.4}
          metalness={0.2}
        />
      </mesh>

      {/* Dynamic Swirling Cloud Layer */}
      <mesh ref={cloudsRef} scale={1.03}>
        <sphereGeometry args={[body.size, 32, 32]} />
        <meshStandardMaterial
          map={cloudTexture}
          transparent
          opacity={0.45}
          blending={THREE.NormalBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Planetary Ring System */}
      {body.hasRing && (
        <mesh ref={ringRef} rotation={[Math.PI / 3.2, 0.2, 0]}>
          <ringGeometry
            args={[
              body.size * 1.35,
              body.size * (body.ringRadius || 2.2),
              64,
            ]}
          />
          <meshStandardMaterial
            color={body.ringColor || body.color}
            side={THREE.DoubleSide}
            transparent
            opacity={0.65}
            roughness={0.2}
            metalness={0.4}
          />
        </mesh>
      )}
    </group>
  );
}
