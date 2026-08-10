/// <reference types="@react-three/fiber" />
import React, { useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import GuidingStar from "./components/GuidingStar";
import CelestialPlanet from "./components/CelestialPlanet";
import OrbitRings from "./components/OrbitRings";
import Nebulae from "./components/Nebulae";
import ShootingStars from "./components/ShootingStars";
import CosmicDust from "./components/CosmicDust";
import CosmicHUD from "./components/CosmicHUD";
import { CELESTIAL_BODIES } from "./constants";
import { CelestialBody } from "./types";
import { ambientAudio } from "./utils/ambientAudio";

function CameraRig({ selectedBody }: { selectedBody: CelestialBody | null }) {
  useFrame((state) => {
    const time = state.clock.getElapsedTime();

    if (selectedBody) {
      const targetPos = new THREE.Vector3(
        selectedBody.position[0] + 4.5,
        selectedBody.position[1] + 2.5,
        selectedBody.position[2] + 6.5
      );
      state.camera.position.lerp(targetPos, 0.04);
      state.camera.lookAt(
        selectedBody.position[0],
        selectedBody.position[1],
        selectedBody.position[2]
      );
    } else {
      // Cinematic breathing camera movement
      const swayX = Math.sin(time * 0.25) * 1.2;
      const swayY = Math.cos(time * 0.2) * 0.8;
      state.camera.position.x += (swayX - state.camera.position.x) * 0.005;
      state.camera.position.y += (8 + swayY - state.camera.position.y) * 0.005;
    }
  });
  return null;
}

interface CosmosCanvasProps {
  onOpenApp?: (body: CelestialBody) => void;
}

export default function CosmosCanvas({ onOpenApp }: CosmosCanvasProps = {}) {
  const [isAwakened, setIsAwakened] = useState(false);
  const [selectedBody, setSelectedBody] = useState<CelestialBody | null>(null);

  // Auto awaken sequence after initial silent pulse
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsAwakened(true);
      ambientAudio.awaken(4);
    }, 1800);

    // Only clearing the timer here left the drone playing indefinitely in the background after
    // switching to Desktop/List mode (this component unmounts, but nothing ever told the engine to
    // stop) — sleep() is always safe to call even if the drone was never actually awakened (the
    // timer cleared before it fired), it just no-ops in that case.
    return () => {
      clearTimeout(timer);
      ambientAudio.sleep(1);
    };
  }, []);

  const handleTriggerAwaken = () => {
    if (!isAwakened) {
      setIsAwakened(true);
      ambientAudio.awaken(3);
    }
  };

  const handleSelectBody = (body: CelestialBody) => {
    setSelectedBody((prev) => (prev?.id === body.id ? null : body));
  };

  const handleSelectGuidingStar = () => {
    if (!isAwakened) {
      handleTriggerAwaken();
      return;
    }
    const rixieCore = CELESTIAL_BODIES.find((body) => body.id === "rixie");
    if (rixieCore) handleSelectBody(rixieCore);
  };

  return (
    <div
      onClick={handleTriggerAwaken}
      className="fixed inset-0 h-screen w-screen overflow-hidden bg-[#020204] z-0 select-none cursor-pointer"
    >
      {/* Full Screen 3D React Three Fiber Viewport */}
      <Canvas
        camera={{ position: [0, 8, 32], fov: 50 }}
        gl={{ antialias: true, alpha: false, toneMapping: THREE.ACESFilmicToneMapping }}
        style={{ width: "100vw", height: "100vh" }}
      >
        <color attach="background" args={["#020204"]} />

        {/* Cinematic PBR Lighting Setup */}
        <ambientLight intensity={isAwakened ? 0.45 : 0.08} />
        <pointLight position={[0, 0, 0]} intensity={isAwakened ? 3.5 : 1.2} color="#38bdf8" />
        <directionalLight position={[15, 25, 20]} intensity={isAwakened ? 1.4 : 0.2} color="#f8fafc" />

        {/* Deep Cosmic Starfields (Twinkling Multi-Depth) */}
        {isAwakened && (
          <>
            <Stars radius={120} depth={60} count={6000} factor={4} saturation={0.6} fade speed={0.8} />
            <Stars radius={60} depth={30} count={2500} factor={6} saturation={0.8} fade speed={1.2} />
          </>
        )}

        {/* Volumetric Nebulae & Ambient Stardust */}
        {isAwakened && <Nebulae />}
        {isAwakened && <CosmicDust />}
        {isAwakened && <ShootingStars />}

        {/* Rixie Core - Warm Intelligent Heart of the Cosmos */}
        <GuidingStar isAwakened={isAwakened} onAwaken={handleSelectGuidingStar} />

        {/* Orbit Gravitational Tracks & Handcrafted PBR Planets */}
        <OrbitRings bodies={CELESTIAL_BODIES} isAwakened={isAwakened} />

        {CELESTIAL_BODIES.filter((body) => body.id !== "rixie").map((body) => (
          <CelestialPlanet
            key={body.id}
            body={body}
            isSelected={selectedBody?.id === body.id}
            onSelect={handleSelectBody}
            isAwakened={isAwakened}
          />
        ))}

        {/* Orbit Controls & Cinematic Camera Rig */}
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          maxDistance={65}
          minDistance={3}
          autoRotate={!selectedBody && isAwakened}
          autoRotateSpeed={0.25}
          rotateSpeed={0.6}
        />
        <CameraRig selectedBody={selectedBody} />
      </Canvas>

      <CosmicHUD
        isAwakened={isAwakened}
        onAwaken={handleTriggerAwaken}
        selectedBody={selectedBody}
        onCloseInspector={() => setSelectedBody(null)}
        onOpenApp={onOpenApp}
      />
    </div>
  );
}
