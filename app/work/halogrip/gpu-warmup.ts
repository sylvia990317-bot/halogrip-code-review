import type { Camera, Mesh, Object3D, Texture, WebGLRenderer } from "three";

/**
 * Upload textures and compile shaders before the first animated frame.
 * Temporarily expose hidden objects for compilation, then restore their visibility.
 * The deadline keeps driver stalls from blocking the intro; disposal cancels readiness.
 */
export function warmupScene(
  gl: WebGLRenderer,
  scene: Object3D,
  camera: Camera,
  onReady: () => void,
): () => void {
  let cancelled = false;
  let delivered = false;
  const finish = () => {
    if (cancelled || delivered) return;
    delivered = true;
    clearTimeout(deadline);
    onReady();
  };
  const deadline = setTimeout(finish, 2500);
  const hidden: Object3D[] = [];
  const textures = new Set<Texture>();
  scene.traverse((object) => {
    if (!object.visible) { hidden.push(object); object.visible = true; }
    const material = (object as Mesh).material;
    if (!material) return;
    for (const item of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(item)) {
        if ((value as Texture | null)?.isTexture) textures.add(value as Texture);
      }
    }
  });
  let compiled: Promise<unknown>;
  try {
    for (const texture of textures) gl.initTexture(texture);
    compiled = gl.compileAsync(scene, camera);
  } catch {
    compiled = Promise.resolve();
  } finally {
    for (const object of hidden) object.visible = false;
  }
  void compiled.then(finish, finish);
  return () => { cancelled = true; clearTimeout(deadline); };
}
