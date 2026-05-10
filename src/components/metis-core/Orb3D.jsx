import { Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, MeshDistortMaterial, Sphere } from '@react-three/drei'
import * as THREE from 'three'

const TONES = {
  amethyst: {
    core: '#a06bf0',
    rim: '#5b1aa6',
    halo: '#8a2be2',
    glow: '#d6b8ff',
  },
  amber: {
    core: '#ff8c00',
    rim: '#c0376e',
    halo: '#f472b6',
    glow: '#ffd9a8',
  },
}

function Core({ tone = 'amethyst', intensity = 1 }) {
  const t = TONES[tone] ?? TONES.amethyst
  const meshRef = useRef(null)
  const matRef = useRef(null)
  const time = useRef(0)

  useFrame((state, delta) => {
    time.current += delta
    const m = meshRef.current
    if (m) {
      const px = state.pointer.x
      const py = state.pointer.y
      m.rotation.y += delta * 0.18 + px * 0.01
      m.rotation.x = THREE.MathUtils.damp(m.rotation.x, -py * 0.4, 4, delta)
      const pulse = 1 + Math.sin(time.current * 1.6) * 0.025 * intensity
      m.scale.setScalar(pulse)
    }
    if (matRef.current) {
      matRef.current.distort = 0.34 + Math.sin(time.current * 1.1) * 0.06 * intensity
      matRef.current.speed = 1.2 + intensity * 0.4
    }
  })

  return (
    <Float
      speed={1.2}
      rotationIntensity={0.25 * intensity}
      floatIntensity={0.6 * intensity}
    >
      <Sphere ref={meshRef} args={[1, 96, 96]}>
        <MeshDistortMaterial
          ref={matRef}
          color={t.core}
          emissive={t.core}
          emissiveIntensity={0.55}
          roughness={0.18}
          metalness={0.35}
          distort={0.34}
          speed={1.4}
        />
      </Sphere>

      {/* Inner luminous core */}
      <Sphere args={[0.55, 48, 48]}>
        <meshBasicMaterial color={t.glow} transparent opacity={0.55} />
      </Sphere>

      {/* Concentric rings (subtle structure for sci-fi feel) */}
      <mesh rotation={[Math.PI / 2.2, 0, 0]}>
        <torusGeometry args={[1.18, 0.005, 16, 128]} />
        <meshBasicMaterial color={t.halo} transparent opacity={0.35} />
      </mesh>
      <mesh rotation={[Math.PI / 2, Math.PI / 4, 0]}>
        <torusGeometry args={[1.32, 0.004, 12, 128]} />
        <meshBasicMaterial color={t.halo} transparent opacity={0.18} />
      </mesh>
    </Float>
  )
}

function Halo({ tone = 'amethyst' }) {
  const t = TONES[tone] ?? TONES.amethyst
  // Backdrop fog disc that gives the orb a glow without a postFX pass.
  const haloRef = useRef(null)
  useFrame((state, delta) => {
    if (!haloRef.current) return
    haloRef.current.rotation.z += delta * 0.05
  })
  const colorA = useMemo(() => new THREE.Color(t.halo), [t.halo])
  const colorB = useMemo(() => new THREE.Color(t.rim), [t.rim])
  return (
    <mesh ref={haloRef} position={[0, 0, -0.6]}>
      <circleGeometry args={[2.4, 64]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={{
          uA: { value: colorA },
          uB: { value: colorB },
        }}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          varying vec2 vUv;
          uniform vec3 uA;
          uniform vec3 uB;
          void main() {
            float d = distance(vUv, vec2(0.5));
            float a = smoothstep(0.5, 0.10, d);
            vec3 c = mix(uB, uA, smoothstep(0.0, 0.4, d));
            gl_FragColor = vec4(c, a * 0.55);
          }
        `}
      />
    </mesh>
  )
}

export default function Orb3D({
  size = 360,
  tone = 'amethyst',
  intensity = 1,
}) {
  const glRef = useRef(null)

  // The Lander unmounts on every navigation away, so this Canvas is recreated
  // every time the user returns. r3f's default unmount disposes resources but
  // doesn't release the WebGL context — without forceContextLoss() they pile
  // up against Chrome's ~16-context cap and new Canvas creation eventually
  // stalls. Cleanup runs after r3f's own teardown.
  useEffect(() => {
    return () => {
      const gl = glRef.current
      if (gl) gl.forceContextLoss?.()
      glRef.current = null
    }
  }, [])

  return (
    <div
      className="metis-orb3d"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <Canvas
        camera={{ position: [0, 0, 3.4], fov: 38 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          glRef.current = gl
        }}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[3, 3, 3]} intensity={1.2} color={tone === 'amber' ? '#ffd9a8' : '#d6b8ff'} />
        <pointLight position={[-3, -2, 1]} intensity={0.9} color={tone === 'amber' ? '#f472b6' : '#5b1aa6'} />
        <directionalLight position={[0, 5, 5]} intensity={0.4} />
        <Suspense fallback={null}>
          <Halo tone={tone} />
          <Core tone={tone} intensity={intensity} />
        </Suspense>
      </Canvas>
    </div>
  )
}
