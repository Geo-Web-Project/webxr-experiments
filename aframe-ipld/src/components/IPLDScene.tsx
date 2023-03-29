import React from "react";
import { useXR } from "@react-three/xr";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { CID } from "multiformats/cid";
import { IPFS_GATEWAY_HOST } from "../App";

type IPLDSceneProps = {
  arPackage: Package;
};

type GlTFModelComponent = CID;
type VectorComponent = {
  x: number;
  y: number;
  z: number;
};
type PositionComponent = VectorComponent;
type ScaleComponent = VectorComponent;
type RotationComponent = VectorComponent;

export type Package = {
  glTFModel?: GlTFModelComponent;
  position?: PositionComponent;
  scale?: ScaleComponent;
  rotation?: RotationComponent;
};

export default function IPLDScene({ arPackage }: IPLDSceneProps) {
  const { session } = useXR();

  const [gltf, setGltf] = React.useState<GLTF | null>(null);

  React.useEffect(() => {
    async function fetch() {
      if (arPackage.glTFModel) {
        const loader = new GLTFLoader();
        loader.load(
          `${IPFS_GATEWAY_HOST}/ipfs/${arPackage.glTFModel.toString()}`,
          function (_gltf) {
            setGltf(_gltf);
          },
          function (xhr) {
            console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
          },
          function (error) {
            console.error(error);
            setGltf(null);
          }
        );
      } else {
        setGltf(null);
      }
    }

    fetch();
  }, [arPackage]);

  if (!session) {
    return null;
  }

  return (
    <>
      <hemisphereLight groundColor={0xbbbbff} position={[0.5, 1, 0.25]} />
      {gltf && arPackage ? (
        <primitive
          object={gltf.scene}
          scale={
            arPackage.scale
              ? [arPackage.scale.x, arPackage.scale.y, arPackage.scale.z]
              : null
          }
          rotation={
            arPackage.rotation
              ? [
                  arPackage.rotation.x,
                  arPackage.rotation.y,
                  arPackage.rotation.z,
                ]
              : null
          }
          position={
            arPackage.position
              ? [
                  arPackage.position.x,
                  arPackage.position.y,
                  arPackage.position.z,
                ]
              : null
          }
        />
      ) : null}
    </>
  );
}
