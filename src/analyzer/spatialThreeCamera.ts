import * as THREE from 'three';
import { spatialCameraPose, type SpatialCameraModel } from './spatialCoordinates';

export function configureSpatialCamera(camera: THREE.OrthographicCamera, model: SpatialCameraModel): THREE.OrthographicCamera {
  const pose = spatialCameraPose(model);
  camera.left = pose.left;
  camera.right = pose.right;
  camera.top = pose.top;
  camera.bottom = pose.bottom;
  camera.near = pose.near;
  camera.far = pose.far;
  camera.zoom = 1;
  camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
