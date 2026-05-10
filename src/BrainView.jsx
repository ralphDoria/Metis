import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const API_BASE = 'http://localhost:8000'
const N_VERTS_PER_HEMI = 10242
const HEMI_BYTES = N_VERTS_PER_HEMI * 3
const FRAME_BYTES = HEMI_BYTES * 2
const SCRUB_RATE_HZ = 10 // timesteps per second when auto-scrubbing

// Geometry GLBs are pre-baked by the server at startup (see ensure_geometry
// in server/brain_export.py). Loaded once on mount, reused across every job.
const LH_GEOM_URL = '/static/brain_left.glb'
const RH_GEOM_URL = '/static/brain_right.glb'

// Color used for the empty (pre-data) state — uniform light grey on every
// vertex. Matches a generic anatomical brain look without implying activation.
const NEUTRAL_RGB = 200

/**
 * Find the first Mesh under a GLTF scene and return its geometry.
 * GLTFLoader returns a scene graph; trimesh exports nest the mesh one level deep.
 */
function firstMesh(gltfScene) {
  let found = null
  gltfScene.traverse((obj) => {
    if (!found && obj.isMesh) found = obj
  })
  return found
}

/**
 * Replace whatever material trimesh shipped with a Lambert material that reads
 * vertex colors. Lambert keeps anatomical shape via diffuse shading without
 * over-darkening dim activation regions.
 */
function applyLambert(mesh) {
  mesh.material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  })
  mesh.geometry.computeVertexNormals()
}

export default function BrainView({ brain }) {
  const containerRef = useRef(null)
  const stateRef = useRef(null) // { renderer, scene, camera, controls, lh, rh, colors, ... }
  const scrubbingRef = useRef(false) // user actively dragging slider
  const [timestep, setTimestep] = useState(0)
  const [meshesReady, setMeshesReady] = useState(false)
  const [hasData, setHasData] = useState(false)
  const [error, setError] = useState('')

  // ---- Init Three.js scene once. ----
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = null

    const w = container.clientWidth
    const h = container.clientHeight
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000)
    camera.position.set(0, 0, 350)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setClearColor(0x000000, 0)
    renderer.setSize(w, h)
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const dir = new THREE.DirectionalLight(0xffffff, 0.7)
    dir.position.set(1, 1, 1)
    scene.add(dir)
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35)
    dir2.position.set(-1, -0.5, -1)
    scene.add(dir2)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 0, 0)
    controls.autoRotate = true
    controls.autoRotateSpeed = 10 // ~100s per orbit; tune later

    const state = {
      renderer,
      scene,
      camera,
      controls,
      group: null,
      lh: null,
      rh: null,
      defaultPos: new THREE.Vector3(),
      defaultTarget: new THREE.Vector3(),
      tween: null, // { fromPos, fromTarget, t0, duration }
      // Auto-scrub state. playT advances continuously; t0 = floor(playT) is
      // shown on the slider, alpha = playT - t0 blends between adjacent
      // timesteps for smooth interpolation.
      colors: null,        // Uint8Array of full color buffer
      nTimesteps: 0,
      playT: 0,
      scratchLh: null,     // Uint8Array(HEMI_BYTES) for lerped frame
      scratchRh: null,
      lastFrameMs: 0,
      lastDisplayedT: -1,
      raf: 0,
    }
    stateRef.current = state

    // Drag begins → freeze auto-rotate, kill any in-progress normalize tween.
    controls.addEventListener('start', () => {
      controls.autoRotate = false
      state.tween = null
    })
    // Drag ends → tween camera to nearest point on the canonical orbit
    // circle (radius R = |defaultPos|, equatorial Y=0), preserving the user's
    // landing azimuth, then resume spin. Duration scales with angular sweep
    // so small corrections snap fast and 180° flips don't drag.
    controls.addEventListener('end', () => {
      if (!state.defaultPos.lengthSq()) return // not yet initialized
      const toPos = nearestOrbitTarget(camera.position, state.defaultPos)
      const fromFlat = camera.position.clone().setY(0)
      const angle = fromFlat.lengthSq() > 0 ? fromFlat.angleTo(toPos) : Math.PI
      const duration = THREE.MathUtils.clamp(angle * 600, 400, 1400)
      state.tween = {
        fromPos: camera.position.clone(),
        toPos,
        fromTarget: controls.target.clone(),
        t0: performance.now(),
        duration,
      }
    })

    const tick = () => {
      stepTween(state)
      stepScrub(state, scrubbingRef.current, setTimestep)
      controls.update()
      renderer.render(scene, camera)
      state.raf = requestAnimationFrame(tick)
    }
    state.raf = requestAnimationFrame(tick)

    const onResize = () => {
      const cw = container.clientWidth
      const ch = container.clientHeight
      camera.aspect = cw / ch
      camera.updateProjectionMatrix()
      renderer.setSize(cw, ch)
    }
    window.addEventListener('resize', onResize)

    // Slider pointerdown sets scrubbingRef true; release anywhere on window
    // clears it (covers cursor leaving slider mid-drag).
    const onWindowPointerUp = () => {
      scrubbingRef.current = false
    }
    window.addEventListener('pointerup', onWindowPointerUp)

    return () => {
      cancelAnimationFrame(state.raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('pointerup', onWindowPointerUp)
      controls.dispose()
      // Dispose hemi meshes' geometry + material so the loaded GLB buffers and
      // vertex-color attributes don't linger on the GPU after unmount.
      for (const m of [state.lh, state.rh]) {
        if (!m) continue
        m.geometry?.dispose()
        if (Array.isArray(m.material)) m.material.forEach((mm) => mm.dispose())
        else m.material?.dispose()
      }
      renderer.dispose()
      // dispose() flags resources for GC but doesn't release the WebGL context.
      // Without this, repeated nav (lander ↔ dashboard) leaks contexts until
      // Chrome's ~16-context cap kicks in and stalls new Canvas creation.
      renderer.forceContextLoss()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      stateRef.current = null
    }
  }, [])

  // ---- Load geometry once on mount. Same fsaverage5 pial mesh drives every
  //      job, so we fetch it from the server's pre-baked static endpoint and
  //      keep it in the scene for the lifetime of the component. The empty
  //      (pre-data) state shows this mesh painted neutral grey, auto-rotating.
  useEffect(() => {
    if (!stateRef.current) return
    const state = stateRef.current
    let cancelled = false

    const loader = new GLTFLoader()
    const loadHemi = (url) =>
      new Promise((resolve, reject) => {
        loader.load(`${API_BASE}${url}`, (gltf) => resolve(gltf), undefined, reject)
      })

    Promise.all([loadHemi(LH_GEOM_URL), loadHemi(RH_GEOM_URL)])
      .then(([lhGltf, rhGltf]) => {
        if (cancelled) return
        const lh = firstMesh(lhGltf.scene)
        const rh = firstMesh(rhGltf.scene)
        if (!lh || !rh) throw new Error('GLB missing mesh')
        applyLambert(lh)
        applyLambert(rh)

        // Center the brain on the origin so OrbitControls rotates about its
        // centroid. fsaverage5 pial coords are already roughly centered, but
        // recompute to be safe.
        for (const m of [lh, rh]) {
          m.geometry.computeBoundingBox()
        }
        const bbox = new THREE.Box3()
          .union(lh.geometry.boundingBox)
          .union(rh.geometry.boundingBox)
        const center = bbox.getCenter(new THREE.Vector3())
        lh.position.sub(center)
        rh.position.sub(center)

        // Wrap meshes in a group and rotate the group to map brain RAS frame
        // (X = right, Y = anterior, Z = superior) onto the world frame that
        // matches Three.js' default camera (at +Z looking -Z, up +Y):
        //   brain +X (right)     → world +Z (faces camera; lateral right view)
        //   brain +Y (anterior)  → world +X (anterior on viewer's right)
        //   brain +Z (superior)  → world +Y (top of head up on screen)
        const group = new THREE.Group()
        group.add(lh)
        group.add(rh)
        const basis = new THREE.Matrix4().makeBasis(
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 1, 0),
        )
        group.quaternion.setFromRotationMatrix(basis)

        state.scene.add(group)
        state.group = group
        state.lh = lh
        state.rh = rh

        // Frame the brain in the camera. Bbox diagonal length is rotation-
        // invariant so this distance stays valid after the group rotation.
        const size = bbox.getSize(new THREE.Vector3()).length()
        state.camera.position.set(0, 0, size * 1.6)
        state.controls.target.set(0, 0, 0)
        state.camera.lookAt(0, 0, 0)
        state.defaultPos.copy(state.camera.position)
        state.defaultTarget.copy(state.controls.target)

        // Paint uniform neutral grey on every vertex. This is the empty-state
        // look; once a `brain` payload arrives, the raf loop overwrites these
        // bytes per frame with interpolated activation colors.
        const grey = new Uint8Array(HEMI_BYTES).fill(NEUTRAL_RGB)
        writeVertexColors(lh.geometry, grey)
        writeVertexColors(rh.geometry, grey)

        setMeshesReady(true)
      })
      .catch((err) => {
        console.error('BrainView geometry load failed:', err)
        if (!cancelled) setError(err.message ?? 'Failed to load brain geometry')
      })

    return () => {
      cancelled = true
    }
  }, [])

  // ---- Load color buffer when `brain` payload arrives, clear when it goes
  //      away. Geometry stays put; only the per-vertex color stream changes.
  useEffect(() => {
    if (!stateRef.current) return
    const state = stateRef.current

    if (!brain) {
      // Empty / reset state: stop the auto-scrub from writing colors and
      // repaint the mesh uniform grey so the user sees a clean wipe rather
      // than a frozen activation frame. Geometry (and rotation) stay put.
      state.colors = null
      state.nTimesteps = 0
      state.lastDisplayedT = -1
      if (state.lh && state.rh) {
        const grey = new Uint8Array(HEMI_BYTES).fill(NEUTRAL_RGB)
        writeVertexColors(state.lh.geometry, grey)
        writeVertexColors(state.rh.geometry, grey)
      }
      setHasData(false)
      return
    }

    let cancelled = false
    setError('')

    fetch(`${API_BASE}${brain.colors_url}`)
      .then((r) => {
        if (!r.ok) throw new Error(`colors: ${r.status}`)
        return r.arrayBuffer()
      })
      .then((colorBuf) => {
        if (cancelled) return
        // Atomic swap: previous activation is held until this assignment, so
        // re-analyze never flashes grey.
        state.colors = new Uint8Array(colorBuf)
        state.nTimesteps = brain.n_timesteps
        state.playT = 0
        state.scratchLh = state.scratchLh ?? new Uint8Array(HEMI_BYTES)
        state.scratchRh = state.scratchRh ?? new Uint8Array(HEMI_BYTES)
        state.lastDisplayedT = -1
        state.lastFrameMs = 0
        setTimestep(0)
        setHasData(true)
      })
      .catch((err) => {
        console.error('BrainView color load failed:', err)
        if (!cancelled) setError(err.message ?? 'Failed to load brain colors')
      })

    return () => {
      cancelled = true
    }
  }, [brain])

  return (
    <div className="metis-brainview">
      <div ref={containerRef} className="metis-brainview__canvas-wrap">
        {!hasData && !error && (
          <span className="metis-brainview__empty">
            Awaiting neural data
          </span>
        )}
      </div>
      {error && <p className="metis-error">{error}</p>}
      {hasData && (
        <div className="metis-brainview__controls">
          <input
            type="range"
            min={0}
            max={Math.max(0, (brain?.n_timesteps ?? 1) - 1)}
            value={timestep}
            onPointerDown={() => {
              scrubbingRef.current = true
            }}
            onChange={(e) => {
              const v = Number(e.target.value)
              setTimestep(v)
              if (stateRef.current) {
                stateRef.current.playT = v
                stateRef.current.lastDisplayedT = v
              }
            }}
            className="metis-brainview__slider"
            disabled={!meshesReady}
          />
          <span className="metis-brainview__time">
            t = {timestep} / {Math.max(0, (brain?.n_timesteps ?? 1) - 1)}
          </span>
        </div>
      )}
      {hasData && (
        <div className="metis-brainview__legend">
          <span className="metis-brainview__legend-bar" />
          <span>low → high</span>
        </div>
      )}
    </div>
  )
}

/**
 * Cubic ease-in-out: smooth start, smooth land, no overshoot.
 */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Find the nearest point on the canonical auto-rotate orbit to the camera's
 * current position. Orbit = circle in the Y=0 plane, radius R = |defaultPos|,
 * centered on `controls.target` (assumed origin here). Preserves the user's
 * azimuth (where they landed); restores radius + elevation to canonical so
 * auto-rotate resumes seamlessly. Singular case (camera over the pole) falls
 * back to defaultPos.
 */
function nearestOrbitTarget(currentPos, defaultPos) {
  const R = defaultPos.length()
  const d = Math.hypot(currentPos.x, currentPos.z)
  if (d < 1e-3) return defaultPos.clone()
  return new THREE.Vector3((currentPos.x * R) / d, 0, (currentPos.z * R) / d)
}

/**
 * Step the camera-return tween one frame. When the user releases the mouse
 * after a manual rotation, we tween the camera to the nearest point on the
 * auto-rotate orbit (cached at tween creation as `tw.toPos`), then resume
 * OrbitControls' built-in auto-rotate.
 */
function stepTween(state) {
  const tw = state.tween
  if (!tw) return
  const k = (performance.now() - tw.t0) / tw.duration
  if (k >= 1) {
    state.camera.position.copy(tw.toPos)
    state.controls.target.copy(state.defaultTarget)
    state.tween = null
    state.controls.autoRotate = true
    return
  }
  const e = easeInOutCubic(k)
  state.camera.position.lerpVectors(tw.fromPos, tw.toPos, e)
  state.controls.target.lerpVectors(tw.fromTarget, state.defaultTarget, e)
}

/**
 * Advance the auto-scrub one frame and write smoothly-interpolated vertex
 * colors. `playT` is a fractional timestep that walks at SCRUB_RATE_HZ when
 * the user isn't dragging the slider; per-frame we floor it to t0, take t1
 * as the next timestep (wrapping to 0 at the end), and lerp the two color
 * frames by alpha = playT - t0. The integer t0 is pushed to React state
 * only on change so we don't re-render every frame.
 */
function stepScrub(state, isScrubbing, setTimestep) {
  if (!state.colors || !state.lh || !state.rh || state.nTimesteps === 0) return
  const now = performance.now()
  const dt = state.lastFrameMs ? (now - state.lastFrameMs) / 1000 : 0
  state.lastFrameMs = now

  if (!isScrubbing) {
    state.playT = (state.playT + SCRUB_RATE_HZ * dt) % state.nTimesteps
  }

  const t0 = Math.floor(state.playT)
  const t1 = (t0 + 1) % state.nTimesteps
  const alpha = state.playT - t0
  const off0 = t0 * FRAME_BYTES
  const off1 = t1 * FRAME_BYTES
  const colors = state.colors
  const sLh = state.scratchLh
  const sRh = state.scratchRh

  // Lerp left hemi.
  for (let i = 0; i < HEMI_BYTES; i++) {
    const a = colors[off0 + i]
    const b = colors[off1 + i]
    sLh[i] = (a + (b - a) * alpha) | 0
  }
  // Lerp right hemi (offset HEMI_BYTES into each frame).
  for (let i = 0; i < HEMI_BYTES; i++) {
    const a = colors[off0 + HEMI_BYTES + i]
    const b = colors[off1 + HEMI_BYTES + i]
    sRh[i] = (a + (b - a) * alpha) | 0
  }

  writeVertexColors(state.lh.geometry, sLh)
  writeVertexColors(state.rh.geometry, sRh)

  if (t0 !== state.lastDisplayedT) {
    state.lastDisplayedT = t0
    setTimestep(t0)
  }
}

/**
 * Write a uint8 RGB slice into a BufferGeometry's color attribute.
 *
 * Three.js expects vertex colors as Float32 in [0,1] when the attribute is
 * declared float. Using a Uint8 attribute with `normalized=true` lets us write
 * the bytes verbatim without per-frame conversion — much cheaper for scrub.
 */
function writeVertexColors(geometry, rgbBytes) {
  let attr = geometry.getAttribute('color')
  if (!attr || !(attr.array instanceof Uint8Array) || attr.array.length !== rgbBytes.length) {
    attr = new THREE.BufferAttribute(new Uint8Array(rgbBytes.length), 3, true)
    geometry.setAttribute('color', attr)
  }
  attr.array.set(rgbBytes)
  attr.needsUpdate = true
}
