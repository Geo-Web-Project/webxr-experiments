import React from "react";
import { useXR } from "@react-three/xr";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import type { IPFS } from "ipfs-core-types";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { CID } from "multiformats/cid";
import { default as axios } from "axios";
import * as Block from "multiformats/block";
import * as dagjson from "@ipld/dag-json";
import { sha256 as hasher } from "multiformats/hashes/sha2";

type IPLDSceneProps = {
  ipfs: IPFS;
  rootCID: CID;
};

type GlTFModelComponent = CID;
type PositionComponent = {
  x: number;
  y: number;
  z: number;
};

type Package = {
  glTFModel?: GlTFModelComponent;
  position?: PositionComponent;
};

const ipfsGatewayHost = "https://dweb.link";

export default function IPLDScene({ ipfs, rootCID }: IPLDSceneProps) {
  const { session } = useXR();

  const [arPackage, setArPackage] = React.useState<Package | null>(null);
  const [gltf, setGltf] = React.useState<GLTF | null>(null);

  React.useEffect(() => {
    async function fetch() {
      const cidStr = rootCID.toString();
      console.debug(
        `Retrieving raw block from: ${ipfsGatewayHost}/ipfs/${cidStr}`
      );
      const rawBlock = await axios.get(`${ipfsGatewayHost}/ipfs/${cidStr}`, {
        responseType: "arraybuffer",
        headers: { Accept: "application/vnd.ipld.raw" },
      });
      const uintBuffer = new Uint8Array(rawBlock.data);
      const block = await Block.decode({
        bytes: uintBuffer,
        codec: dagjson,
        hasher,
      });

      const v = block.value as Package;
      setArPackage(v);

      if (v.glTFModel) {
        const loader = new GLTFLoader();
        loader.load(
          `https://dweb.link/ipfs/${v.glTFModel.toString()}`,
          // called when the resource is loaded
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
  }, [ipfs, rootCID]);

  // if (!session) {
  //   return null;
  // }

  return (
    <>
      <hemisphereLight groundColor={0xbbbbff} position={[0.5, 1, 0.25]} />
      {gltf && arPackage ? (
        <primitive
          object={gltf.scene}
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
