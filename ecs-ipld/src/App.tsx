import React from "react";
import IPLDScene, { Package } from "./components/IPLDScene";
import { Canvas } from "@react-three/fiber";
import { ARButton, XR } from "@react-three/xr";
import type { IPFS } from "ipfs-core-types";
import { default as axios } from "axios";
import * as Block from "multiformats/block";
import * as dagjson from "@ipld/dag-json";
import { sha256 as hasher } from "multiformats/hashes/sha2";

export const IPFS_GATEWAY_HOST = "https://dweb.link";

function App({ ipfsP }: { ipfsP: any }) {
  const { hash } = window.location;
  const rootCIDStr =
    hash.length > 0
      ? hash.replace("#", "")
      : "baguqeerapq7vkke4pyivw2iptex3z352hg7agozle53llafgkm3t2e6x22jq";
  const [ipfs, setIpfs] = React.useState<IPFS | null>(null);
  const [arPackage, setArPackage] = React.useState<Package | null>(null);

  React.useEffect(() => {
    (async () => {
      const { ipfs } = await ipfsP;
      setIpfs(ipfs);
    })();
  }, [ipfsP]);

  React.useEffect(() => {
    (async () => {
      console.debug(
        `Retrieving raw block from: ${IPFS_GATEWAY_HOST}/ipfs/${rootCIDStr}`
      );
      const rawBlock = await axios.get(
        `${IPFS_GATEWAY_HOST}/ipfs/${rootCIDStr}`,
        {
          responseType: "arraybuffer",
          headers: { Accept: "application/vnd.ipld.raw" },
        }
      );
      const uintBuffer = new Uint8Array(rawBlock.data);
      const block = await Block.decode({
        bytes: uintBuffer,
        codec: dagjson,
        hasher,
      });

      const v = block.value as Package;
      setArPackage(v);
    })();
  }, []);

  return (
    <>
      {ipfs && arPackage ? (
        <>
          <ARButton
            sessionInit={{
              requiredFeatures: [
                "local",
                "hit-test",
                // "image-tracking",
                // "anchors",
                // "plane-detection",
              ],
            }}
          />
          <Canvas
            camera={{
              fov: 70,
              aspect: window.innerWidth / window.innerHeight,
              near: 0.01,
              far: 20,
            }}
          >
            <XR referenceSpace="local">
              <IPLDScene arPackage={arPackage} />
            </XR>
          </Canvas>
        </>
      ) : null}
    </>
  );
}

export default App;
