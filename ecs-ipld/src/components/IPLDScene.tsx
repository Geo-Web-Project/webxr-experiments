import React from "react";
import { useXR } from "@react-three/xr";
import { CID } from "multiformats/cid";
import { IPFS_GATEWAY_HOST } from "../App";
import type { IPFS } from "ipfs-core-types";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { default as axios } from "axios";

type IPLDSceneProps = {
  arPackage: Package;
  ipfs: IPFS;
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
type ParentComponent = CID;

type Entity = {
  glTFModel: GlTFModelComponent;
  position?: PositionComponent;
  scale?: ScaleComponent;
  rotation?: RotationComponent;
  parent?: ParentComponent;
};

export type Package = CID[];

function Model({ ipfs, entityCID }: { ipfs: IPFS; entityCID: CID }) {
  const [gltf, setGltf] = React.useState<GLTF | null>(null);
  const [entity, setEntity] = React.useState<Entity | null>(null);

  React.useEffect(() => {
    async function fetch() {
      if (!ipfs || gltf) return;

      let result;

      try {
        result = await ipfs.dag.get(entityCID, { timeout: 2000 });
      } catch (e) {
        console.debug(
          `Fetching CAR from Web3.storage: ${entityCID.toString()}`
        );
        const carResponse = await axios.get(
          `https://w3s.link/ipfs/${entityCID.toString()}`,
          {
            responseType: "blob",
            headers: { Accept: "application/vnd.ipld.car" },
          }
        );
        console.debug(
          `Importing CAR from Web3.storage: ${entityCID.toString()}`
        );
        const data = carResponse.data as Blob;
        const buffer = await data.arrayBuffer();
        const uintBuffer = new Uint8Array(buffer);
        ipfs.dag.import(
          (async function* () {
            yield uintBuffer;
          })()
        );

        result = await ipfs.dag.get(entityCID);
      }

      console.log("FOUND: ", entityCID.toString());
      const entity = result.value as Entity;

      setEntity(entity);

      const loader = new GLTFLoader();
      loader.load(
        `${IPFS_GATEWAY_HOST}/ipfs/${entity.glTFModel.toString()}`,
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
    }

    fetch();
  }, []);

  return gltf && entity ? (
    <primitive
      object={gltf.scene}
      scale={
        entity.scale
          ? [entity.scale.x, entity.scale.y, entity.scale.z]
          : [1, 1, 1]
      }
      rotation={
        entity.rotation
          ? [entity.rotation.x, entity.rotation.y, entity.rotation.z]
          : [0, 0, 0]
      }
      position={
        entity.position
          ? [entity.position.x, entity.position.y, entity.position.z]
          : [0, 0, 0]
      }
    />
  ) : null;
}

export default function IPLDScene({ arPackage, ipfs }: IPLDSceneProps) {
  const { session } = useXR();

  if (!session) {
    return null;
  }

  return (
    <>
      <hemisphereLight groundColor={0xbbbbff} position={[0.5, 1, 0.25]} />
      {arPackage.map((entityCID) => {
        return (
          <Model key={entityCID.toString()} entityCID={entityCID} ipfs={ipfs} />
        );
      })}
    </>
  );
}
