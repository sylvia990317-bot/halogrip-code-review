import * as THREE from "three";
import type { Pose } from "./intro-timeline";

// PowerPoint uses clockwise screen rotation; Three.js +Z rotation is counter-clockwise.
const TILT_SIGN = -1;
/** Each model instance owns a cache; rotated bounds are refreshed when its pose changes. */
export type Scratch = { euler: THREE.Euler; matrix: THREE.Matrix4; bounds?: { pitch: number; yaw: number; roll: number; minX: number; maxX: number; minY: number; maxY: number } };

/** Fit the rotated silhouette to an orthographic frame, then tilt around its screen centre.
 * Screen-plane tilt does not change the fit: re-fitting would make the product change size. */
export function fitToFrame(
  place: THREE.Group,
  rotate: THREE.Group,
  pose: Pose,
  silhouette: Float32Array,
  lens: THREE.OrthographicCamera,
  scratch: Scratch,
  depth: number,
  tilt: number,
) {
  const pitch = THREE.MathUtils.degToRad(pose.pitch);
  const yaw = THREE.MathUtils.degToRad(pose.yaw);
  const roll = THREE.MathUtils.degToRad(pose.roll);
  rotate.rotation.set(pitch, yaw, roll);

  // World extents of the viewport — the frame fractions map straight onto these. Read off
  // the live camera rather than assumed, so a resize needs no bookkeeping here.
  const viewHeight = (lens.top - lens.bottom) / lens.zoom;
  const viewWidth = (lens.right - lens.left) / lens.zoom;

  // Measure the rotated silhouette. `scratch.matrix` is the same rotation as the group's.
  if (!scratch.bounds || scratch.bounds.pitch !== pitch || scratch.bounds.yaw !== yaw || scratch.bounds.roll !== roll) {
    scratch.matrix.makeRotationFromEuler(scratch.euler.set(pitch, yaw, roll));
    const m = scratch.matrix.elements; // column-major
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < silhouette.length; i += 3) {
      const x = silhouette[i], y = silhouette[i + 1], z = silhouette[i + 2];
      const rx = m[0] * x + m[4] * y + m[8] * z;
      const ry = m[1] * x + m[5] * y + m[9] * z;
      if (rx < minX) minX = rx;
      if (rx > maxX) maxX = rx;
      if (ry < minY) minY = ry;
      if (ry > maxY) maxY = ry;
    }
    scratch.bounds = { pitch, yaw, roll, minX, maxX, minY, maxY };
  }
  const { minX, maxX, minY, maxY } = scratch.bounds;
  const spanX = Math.max(maxX - minX, 1e-4);
  const spanY = Math.max(maxY - minY, 1e-4);
  const scale = Math.min((pose.fw * viewWidth) / spanX, (pose.fh * viewHeight) / spanY);

  // The silhouette is not symmetric about the origin, so centre it on the frame by hand.
  const offsetX = ((minX + maxX) / 2) * scale;
  const offsetY = ((minY + maxY) / 2) * scale;

  // `place`'s matrix is T * R * S, so this Z turn happens after the scale and before the
  // translation: the offset below has to be turned with it or the model would orbit `place`'s
  // origin (the model's 3D centre) instead of rocking about its own on-screen centre.
  const angle = TILT_SIGN * THREE.MathUtils.degToRad(tilt);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  place.rotation.z = angle;
  place.scale.setScalar(scale);
  place.position.x = (pose.fx + pose.fw / 2 - 0.5) * viewWidth - (offsetX * cos - offsetY * sin);
  place.position.y = (0.5 - (pose.fy + pose.fh / 2)) * viewHeight - (offsetX * sin + offsetY * cos);
  place.position.z = depth;
}
