import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const API_BASE = 'http://localhost:8000'
const N_VERTS_PER_HEMI = 10242
const HEMI_BYTES = N_VERTS_PER_HEMI * 3
const FRAME_BYTES = HEMI_BYTES * 2

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
  const stateRef = useRef(null) // { renderer, scene, camera, controls, lh, rh, raf }
  const [timestep, setTimestep] = useState(0)
  const [colors, setColors] = useState(null) // Uint8Array of full buffer
  const [meshesReady, setMeshesReady] = useState(false)
  const [error, setError] = useState('')

  // ---- Init Three.js scene once. ----
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)

    const w = container.clientWidth
    const h = container.clientHeight
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000)
    camera.position.set(0, 0, 350)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
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

    const state = { renderer, scene, camera, controls, lh: null, rh: null, raf: 0 }
    stateRef.current = state

    const tick = () => {
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

    return () => {
      cancelAnimationFrame(state.raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      stateRef.current = null
    }
  }, [])

  // ---- Load hemisphere GLBs + color buffer when `brain` payload changes. ----
  useEffect(() => {
    if (!brain || !stateRef.current) return
    const state = stateRef.current
    let cancelled = false
    setMeshesReady(false)
    setError('')

    // Drop previous meshes if we're reanalyzing.
    for (const key of ['lh', 'rh']) {
      if (state[key]) {
        state.scene.remove(state[key])
        state[key].geometry?.dispose?.()
        state[key].material?.dispose?.()
        state[key] = null
      }
    }

    const loader = new GLTFLoader()
    const loadHemi = (url) =>
      new Promise((resolve, reject) => {
        loader.load(`${API_BASE}${url}`, (gltf) => resolve(gltf), undefined, reject)
      })

    Promise.all([
      loadHemi(brain.left_geom_url),
      loadHemi(brain.right_geom_url),
      fetch(`${API_BASE}${brain.colors_url}`).then((r) => {
        if (!r.ok) throw new Error(`colors: ${r.status}`)
        return r.arrayBuffer()
      }),
    ])
      .then(([lhGltf, rhGltf, colorBuf]) => {
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

        state.scene.add(lh)
        state.scene.add(rh)
        state.lh = lh
        state.rh = rh

        // Frame the brain in the camera.
        const size = bbox.getSize(new THREE.Vector3()).length()
        state.camera.position.set(0, 0, size * 1.6)
        state.controls.target.set(0, 0, 0)
        state.camera.lookAt(0, 0, 0)

        setColors(new Uint8Array(colorBuf))
        setTimestep(0)
        setMeshesReady(true)
      })
      .catch((err) => {
        console.error('BrainView load failed:', err)
        if (!cancelled) setError(err.message ?? 'Failed to load brain assets')
      })

    return () => {
      cancelled = true
    }
  }, [brain])

  // ---- Apply per-timestep colors to vertex color attribute. ----
  useEffect(() => {
    if (!meshesReady || !colors || !stateRef.current) return
    const { lh, rh } = stateRef.current
    if (!lh || !rh) return

    const t = Math.min(timestep, brain.n_timesteps - 1)
    const frameOffset = t * FRAME_BYTES
    const lhSlice = colors.subarray(frameOffset, frameOffset + HEMI_BYTES)
    const rhSlice = colors.subarray(frameOffset + HEMI_BYTES, frameOffset + FRAME_BYTES)

    writeVertexColors(lh.geometry, lhSlice)
    writeVertexColors(rh.geometry, rhSlice)
  }, [meshesReady, colors, timestep, brain])

  return (
    <section className="brain-section">
      <h2 className="brain-heading">Brain activity</h2>
      <div ref={containerRef} className="brain-canvas-wrap" />
      {error && <p className="error">{error}</p>}
      <div className="brain-controls">
        <input
          type="range"
          min={0}
          max={Math.max(0, (brain?.n_timesteps ?? 1) - 1)}
          value={timestep}
          onChange={(e) => setTimestep(Number(e.target.value))}
          className="brain-slider"
          disabled={!meshesReady}
        />
        <span className="brain-time">
          t = {timestep} / {Math.max(0, (brain?.n_timesteps ?? 1) - 1)}
        </span>
      </div>
      <div className="brain-legend">
        <span className="brain-legend-bar" />
        <span className="brain-legend-text">low → high</span>
      </div>
    </section>
  )
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
