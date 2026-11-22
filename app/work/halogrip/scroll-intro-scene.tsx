"use client";

/** Three.js scene: shared model data, materials, lighting and demand-rendered instances.
 * intro-motion supplies mutable state; intro-projection fits each instance to its frame. */

import { warmupScene } from "./gpu-warmup";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrthographicCamera, useGLTF } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Pose, SceneState } from "./intro-timeline";
import { fitToFrame, type Scratch } from "./intro-projection";

const MODEL_URL = "/models/halogrip.glb";

/**
 * The camera is orthographic, and that is load-bearing rather than stylistic: the frames in
 * `intro-motion.ts` are the model's *projected* bounds, and only a parallel projection lets
 * one scale factor reproduce them. Under perspective the side view — nearly a model-width
 * deep once it is scaled up — was coming out ~30% oversized, because the near half of the
 * grip magnifies. It also matches the deck: PowerPoint's own 3D renders are near-parallel.
 * `zoom` is arbitrary (everything downstream is measured off the camera, not assumed);
 * the camera sits far back so nothing can cross the near plane at any scale.
 */
const CAMERA_Z = 50;
const CAMERA_ZOOM = 300;
/**
 * Target points in the silhouette sample used to measure the model's projected bounds.
 * ~1.5k points is well inside a frame budget and lands within a percent of the true hull.
 */
const SILHOUETTE_SAMPLES = 1500;

/**
 * How far behind the primary instance the backdrop copy sits, in world units. The camera is
 * orthographic, so this changes nothing about the backdrop's size or placement — it exists
 * purely to settle the depth test where the two overlap. It has to clear the models' own
 * depth: normalised to a longest side of 1 and then scaled to roughly a viewport, each is a
 * few world units deep, so a smaller gap would let them interpenetrate.
 */
const BACKDROP_DEPTH = -12;
/**
 * Peak opacity of the backdrop instance, i.e. what `SceneState.backdrop = 1` renders as.
 * The deck puts no alpha on either copy — slide 3's two `<am3d:model3d>` shapes carry no
 * transparency effect at all — so this is a plain appear, transparent to solid. An earlier
 * pass capped it at half strength to protect the callout block's legibility, but the two
 * never actually meet: the backdrop's frame bottoms out at 57% of the viewport height and
 * the callout starts at 68.1%.
 */
const BACKDROP_OPACITY = 1;
/** Below this the backdrop is skipped entirely rather than drawn fully transparent. */
const BACKDROP_EPSILON = 0.002;

/**
 * The deck's own lighting rig, read straight out of `<am3d:model3d>` in the slide XML (it is
 * byte-identical on every slide): one ambient plus three point lights — a warm key high and
 * slightly camera-right, a cool blue fill high and camera-left-front, and a soft violet rim
 * high and camera-left-behind.
 *
 *   <am3d:ambientLight> scrgb .5 .5 .5        illuminance 0.5
 *   <am3d:ptLight>      scrgb 1 .75 .5        intensity  9.765625  pos ( 21959998, 70920001,  16344003)
 *   <am3d:ptLight>      scrgb .4 .6 .95       intensity 12.25      pos (-37964106, 51130435,  57631972)
 *   <am3d:ptLight>      scrgb .86837 .727 1   intensity  3.125     pos (-37739122, 58056624, -34769649)
 *
 * PowerPoint keeps the rig fixed and turns the model inside it, which is what happens here
 * too: the lights sit at Canvas level and the pose only ever rotates the model.
 *
 * Two deliberate departures. The positions are used as *directions*, normalised onto a fixed
 * radius — the deck's are in model units the exported GLB no longer carries, and the model's
 * world size changes at every stage as `fitToFrame` rescales it to the next frame. For that
 * same reason the lights run at `decay={0}`: under physical inverse-square falloff the
 * product would visibly change brightness every time the fit rescaled it. What is preserved
 * is the rig's shape — the directions, the colours, and the 9.77 : 12.25 : 3.13 intensity
 * ratio — brought into three.js's range by one shared gain.
 *
 * Colours are written as the sRGB hex that three's colour management decodes back to the
 * scRGB fractions above; `scrgbClr` is linear-light, a CSS hex literal is not.
 */
const AMBIENT_COLOR = "#bcbcbc";
const AMBIENT_INTENSITY = 0.5;
const LIGHT_RADIUS = 8;
const LIGHT_GAIN = 0.28;

const LIGHT_RIG = [
  { key: "warm-key", color: "#ffe1bc", intensity: 9.765625, at: [21959998, 70920001, 16344003] },
  { key: "cool-fill", color: "#aacbf9", intensity: 12.25, at: [-37964106, 51130435, 57631972] },
  { key: "violet-rim", color: "#f0deff", intensity: 3.125, at: [-37739122, 58056624, -34769649] },
] as const;

function rigPlacement(at: readonly [number, number, number] | readonly number[]): [number, number, number] {
  const [x, y, z] = at;
  const k = LIGHT_RADIUS / Math.hypot(x, y, z);
  return [x * k, y * k, z * k];
}

/**
 * How strongly the environment shows up in the metals. Tuned against the deck's own cached
 * render of this pose (`ppt/media/image2.png` inside the pptx).
 */
const ENV_INTENSITY = 0.55;

/**
 * Image-based lighting, and it is not a nicety here — it is the difference between the two
 * pill buttons reading as brushed silver and reading as black holes.
 *
 * Six of the GLB's thirteen materials ("纹理铝", the buttons and the trim around them) are
 * `metalness: 1` with `roughness: 0.1` and a near-white base colour. A metal has no diffuse
 * term whatsoever: every photon it shows the camera is a reflection of its surroundings. Lit
 * by punctual lights alone there are no surroundings, so all such a material can return is a
 * handful of specular pinpoints where a lamp happens to mirror into the eye — and everywhere
 * else it renders black. That is the classic "metal came out black" trap, and it was the
 * whole of the buttons-look-wrong report; no amount of extra lamps fixes it, because the
 * missing input is an environment. It also accounts for a good part of the model reading
 * dark overall, since the plastics are `metalness: 1` with a metallic-roughness texture too.
 *
 * `RoomEnvironment` ships inside three itself, so this adds no network request and no asset:
 * it is a tiny box-lit room rendered once into a PMREM cubemap at mount.
 */
function StudioEnvironment({ intensity }: { intensity: number }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;

    return () => {
      scene.environment = null;
      target.dispose();
      generator.dispose();
      room.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          material.dispose();
        }
      });
    };
  }, [gl, scene]);

  // Kept off the mount effect so retuning it never rebuilds the cubemap.
  useEffect(() => {
    scene.environmentIntensity = intensity;
    return () => { scene.environmentIntensity = 1; };
  }, [scene, intensity]);

  return null;
}

/**
 * Junk nodes shipped inside the GLB. Every one of these is a camera — the name list
 * is only a defensive backstop, the `isCamera` test below is what actually does the work
 * (Three.js sanitises glTF node names, e.g. "相机 1" -> "相机_1", so name matching alone
 * is unreliable).
 *
 * NOTE: `lux_root` and `11` are deliberately NOT junk. The entire product lives under
 * `lux_root -> Default -> 11`; removing either empties the scene. (`11` carries the
 * ~1152-unit translation that reads like an outlier — it is the model's root transform.)
 */
const JUNK_NAMES = new Set([
  "top", "front", "right", "perspective", "active",
  "相机_1", "相机_2", "相机_3", "相机_4",
]);

function isJunk(object: THREE.Object3D) {
  if ((object as THREE.Camera).isCamera) return true;
  const name = object.name.toLowerCase().replace(/[\s_]+/g, "_").replace(/_?#\d+$/, "");
  return JUNK_NAMES.has(name);
}

function stripJunk(root: THREE.Object3D) {
  const doomed: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object !== root && isJunk(object)) doomed.push(object);
  });
  for (const object of doomed) object.removeFromParent();
  return root;
}

/** Where the model's own origin sits, and what to scale it by to normalise it. */
type Pivot = { scale: number; centre: THREE.Vector3 };
/**
 * The geometry facts every instance shares: one junk-stripped copy of the cached glTF scene
 * to clone from, its pivot, and the silhouette sample. All three depend only on the mesh, so
 * they are computed once no matter how many instances are on screen.
 */
// Start (or join) the model fetch as soon as this chunk evaluates, rather than waiting for
// the Canvas subtree to mount and suspend.
useGLTF.preload(MODEL_URL);

function useModelSource() {
  const { scene } = useGLTF(MODEL_URL);

  /** Our own copy of the cached glTF scene, junk removed. Instances clone this, not `scene`. */
  const source = useMemo(() => stripJunk(scene.clone(true)), [scene]);

  /** Centre the model on the origin and normalise it, so rotation happens about its middle. */
  const pivot = useMemo<Pivot>(() => {
    const box = new THREE.Box3().setFromObject(source);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    return { scale: 1 / Math.max(size.x, size.y, size.z), centre };
  }, [source]);

  /**
   * A subsample of the model's vertices in normalised space. Rotating these every frame
   * gives the real projected width/height of the silhouette; the bounding box's own eight
   * corners would over-estimate badly at 45deg and shrink the model inside its frame.
   */
  const silhouette = useMemo(() => {
    const geometries: THREE.BufferAttribute[] = [];
    const matrices: THREE.Matrix4[] = [];
    let total = 0;

    source.updateMatrixWorld(true);
    source.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
      if (!position) return;
      geometries.push(position);
      matrices.push(mesh.matrixWorld);
      total += position.count;
    });

    const stride = Math.max(1, Math.ceil(total / SILHOUETTE_SAMPLES));
    const points: number[] = [];
    const vector = new THREE.Vector3();

    for (let g = 0; g < geometries.length; g += 1) {
      const position = geometries[g];
      for (let i = 0; i < position.count; i += stride) {
        vector.fromBufferAttribute(position, i).applyMatrix4(matrices[g]);
        points.push(
          (vector.x - pivot.centre.x) * pivot.scale,
          (vector.y - pivot.centre.y) * pivot.scale,
          (vector.z - pivot.centre.z) * pivot.scale,
        );
      }
    }
    return new Float32Array(points);
  }, [source, pivot]);

  return { source, pivot, silhouette };
}

type ModelInstanceProps = {
  source: THREE.Object3D;
  pivot: Pivot;
  silhouette: Float32Array;
  /**
   * Read fresh every frame, never copied — for the primary this is the same mutable object
   * GSAP scrubs, for the backdrop a module-level constant.
   */
  pose: Pose;
  /**
   * Read every frame; 0..1, mapped onto `BACKDROP_OPACITY`. Present only on the backdrop
   * instance — its presence is also what decides whether this instance gets its own
   * materials, since it is the only one that mutates them.
   */
  readFade?: () => number;
  /**
   * Read every frame; degrees of in-picture-plane rock. Present only on the primary instance —
   * the backdrop belongs to slide 3 and is long gone by the stage this drives.
   */
  readTilt?: () => number;
  /** World-space Z. Orthographic, so this only orders the depth test. */
  depth?: number;
};

function ModelInstance({ source, pivot, silhouette, pose, readFade, readTilt, depth = 0 }: ModelInstanceProps) {
  const { camera } = useThree();
  const placeRef = useRef<THREE.Group>(null);
  const rotateRef = useRef<THREE.Group>(null);

  /**
   * `Object3D.clone()` copies nodes but *shares* material references — verified against this
   * GLB: all 21 meshes come back pointing at the source's 13 materials, and setting
   * `opacity` on the clone reads back on the original. A fading instance therefore has to
   * own its materials or it would drag the primary's opacity down with it. Instances that
   * never touch a material skip the copy and keep sharing.
   */
  const { model, materials } = useMemo(() => {
    const copy = source.clone(true);
    if (!readFade) return { model: copy, materials: [] as THREE.Material[] };

    // One clone per distinct material, not per mesh — the 21 meshes share 13 of them.
    const owned = new Map<THREE.Material, THREE.Material>();
    const claim = (material: THREE.Material) => {
      let mine = owned.get(material);
      if (!mine) {
        mine = material.clone();
        // Permanently transparent. Toggling this per frame switched shader variants (the
        // OPAQUE define), so the first fade-in compiled a second set of programs mid-scroll.
        // At opacity 1 normal blending draws exactly what the opaque pass would.
        mine.transparent = true;
        owned.set(material, mine);
      }
      return mine;
    };

    const meshes: THREE.Mesh[] = [];
    copy.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(claim) : claim(mesh.material);
      meshes.push(mesh);
    });

    /**
     * Force the parts to draw near-to-far.
     *
     * Three.js draws transparent objects back-to-front, which is right for stacked planes and
     * wrong for a solid: the far side of the product blends onto the page, then the near side
     * blends on top of *that*, so anywhere the model is two layers deep it comes out roughly
     * twice as dark as anywhere it is one layer deep — the grips end up nearly solid while a
     * single-walled face washes right out. Reversing the order lets the near surface write
     * depth first and the far one fail the test, so every pixel is blended exactly once and
     * the whole instance reads at one uniform opacity.
     *
     * `renderOrder` outranks the distance sort, and this instance's pose never changes (only
     * its opacity is animated), so the ranking can be settled here instead of per frame.
     */
    copy.updateMatrixWorld(true);
    const rotation = new THREE.Matrix4().makeRotationFromEuler(
      new THREE.Euler(
        THREE.MathUtils.degToRad(pose.pitch),
        THREE.MathUtils.degToRad(pose.yaw),
        THREE.MathUtils.degToRad(pose.roll),
      ),
    );
    const centre = new THREE.Vector3();
    const depths = new Map<THREE.Mesh, number>();
    for (const mesh of meshes) {
      mesh.geometry.computeBoundingSphere();
      const sphere = mesh.geometry.boundingSphere;
      centre.set(0, 0, 0);
      if (sphere) centre.copy(sphere.center);
      // The pivot's own offset and scale are the same for every part, so leaving them out
      // shifts all the depths by one constant and cannot change their order.
      depths.set(mesh, centre.applyMatrix4(mesh.matrixWorld).applyMatrix4(rotation).z);
    }
    meshes.sort((a, b) => depths.get(b)! - depths.get(a)!);
    meshes.forEach((mesh, index) => { mesh.renderOrder = index; });

    return { model: copy, materials: [...owned.values()] };
    // `pose` is a stable object either way — a module constant on the backdrop, the object
    // GSAP mutates in place on the primary. Rebuild only when these dependencies change.
  }, [source, readFade, pose]);

  // Only the cloned materials are ours to free; shared ones belong to the glTF cache.
  useEffect(() => () => { for (const material of materials) material.dispose(); }, [materials]);

  const scratch = useMemo<Scratch>(() => ({ euler: new THREE.Euler(), matrix: new THREE.Matrix4() }), []);

  useFrame(() => {
    const place = placeRef.current;
    const rotate = rotateRef.current;
    const lens = camera as THREE.OrthographicCamera;
    if (!place || !rotate || !lens.isOrthographicCamera) return;

    if (readFade) {
      const fade = readFade();
      place.visible = fade > BACKDROP_EPSILON;
      // Outside its stage the instance is skipped whole — no fit, no draw call.
      if (!place.visible) return;
      const opacity = fade * BACKDROP_OPACITY;
      for (const material of materials) material.opacity = opacity;
    }

    fitToFrame(place, rotate, pose, silhouette, lens, scratch, depth, readTilt ? readTilt() : 0);
  });

  const pivotPosition: [number, number, number] = [
    -pivot.centre.x * pivot.scale,
    -pivot.centre.y * pivot.scale,
    -pivot.centre.z * pivot.scale,
  ];

  return (
    <group ref={placeRef}>
      <group ref={rotateRef}>
        <group position={pivotPosition} scale={pivot.scale}>
          <primitive object={model} />
        </group>
      </group>
    </group>
  );
}

type RigProps = {
  state: SceneState;
  backdropPose: Pose;
  onReady: () => void;
};

/** React adapter; the cancellable warm-up lifecycle is independently testable. */
function useGpuWarmup(onReady: () => void) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => warmupScene(gl, scene, camera, onReady), [gl, scene, camera, onReady]);
}

function Rig({ state, backdropPose, onReady }: RigProps) {
  const { source, pivot, silhouette } = useModelSource();
  useGpuWarmup(onReady);

  const readBackdrop = useCallback(() => state.backdrop, [state]);
  const readTilt = useCallback(() => state.tilt, [state]);

  return (
    <>
      {/* Slide 3's second copy. Mounted first and pushed back in Z so the close-up, which is
          opaque and drawn in the same pass, always wins the depth test in front of it. */}
      <ModelInstance
        source={source}
        pivot={pivot}
        silhouette={silhouette}
        pose={backdropPose}
        readFade={readBackdrop}
        depth={BACKDROP_DEPTH}
      />
      {/* The primary: the one instance the whole 8-stage timeline scrubs. */}
      <ModelInstance source={source} pivot={pivot} silhouette={silhouette} pose={state} readTilt={readTilt} />
    </>
  );
}

export type ScrollIntroSceneProps = {
  state: SceneState;
  /** Slide 3's backdrop instance. Fixed — the timeline animates only its opacity. */
  backdropPose: Pose;
  onReady: () => void;
  registerInvalidate: (invalidate: () => void) => void;
  onError: () => void;
};

function RenderLifecycle({ registerInvalidate, onError }: Pick<ScrollIntroSceneProps, "registerInvalidate" | "onError">) {
  const { invalidate, gl } = useThree();
  useEffect(() => {
    registerInvalidate(invalidate);
    invalidate();
    const lost = (event: Event) => { event.preventDefault(); onError(); };
    gl.domElement.addEventListener("webglcontextlost", lost);
    return () => { registerInvalidate(() => {}); gl.domElement.removeEventListener("webglcontextlost", lost); };
  }, [invalidate, gl, registerInvalidate, onError]);
  return null;
}

/** Most scrubbed frames must beat this (≈40fps) at full resolution, or it drops to 1x. */
const SLOW_FRAME_MS = 25;
/** Longer than this between frames is demand-mode idle, not a frame time, and is ignored. */
const IDLE_GAP_MS = 100;
const RESOLUTION_SAMPLES = 90;

/**
 * One-way resolution fallback for weaker GPUs. drei's PerformanceMonitor averages frames per
 * time window, which under `frameloop="demand"` reads every idle pause as a frame-rate collapse;
 * this only measures gaps between consecutive frames of an active scrub.
 */
function AdaptiveResolution() {
  const setDpr = useThree((s) => s.setDpr);
  const sample = useRef({ last: 0, slow: 0, total: 0, done: false });
  useFrame(() => {
    const s = sample.current;
    const now = performance.now();
    const gap = now - s.last;
    s.last = now;
    if (s.done || gap > IDLE_GAP_MS) return;
    s.total += 1;
    if (gap > SLOW_FRAME_MS) s.slow += 1;
    if (s.total < RESOLUTION_SAMPLES) return;
    s.done = true;
    if (s.slow / s.total > 0.5) setDpr(1);
  });
  return null;
}

export default function ScrollIntroScene({ state, backdropPose, onReady, registerInvalidate, onError }: ScrollIntroSceneProps) {
  return (
    <Canvas
      // Capped at 1.5x: the canvas is full-viewport, and above 1.5x the extra fragment cost
      // (PBR, environment map, MSAA) buys little visible sharpness on this silhouette.
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true }}
      frameloop="demand"
      style={{ background: "transparent" }}
    >
      <RenderLifecycle registerInvalidate={registerInvalidate} onError={onError} />
      <AdaptiveResolution />
      <OrthographicCamera makeDefault zoom={CAMERA_ZOOM} near={0.1} far={200} position={[0, 0, CAMERA_Z]} />
      <StudioEnvironment intensity={ENV_INTENSITY} />
      <ambientLight color={AMBIENT_COLOR} intensity={AMBIENT_INTENSITY} />
      {LIGHT_RIG.map((light) => (
        <pointLight
          key={light.key}
          color={light.color}
          intensity={light.intensity * LIGHT_GAIN}
          position={rigPlacement(light.at)}
          decay={0}
        />
      ))}
      <Suspense fallback={null}>
        <Rig state={state} backdropPose={backdropPose} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
