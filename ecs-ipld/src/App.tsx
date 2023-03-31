import React from "react";
import IPLDWorld, { World } from "./components/IPLDWorld";
import { Canvas } from "@react-three/fiber";
import { ARButton, XR } from "@react-three/xr";
import type { IPFS } from "ipfs-core-types";
import { default as axios } from "axios";
import { CID } from "multiformats/cid";

export const IPFS_GATEWAY_HOST = "https://dweb.link";

function App({ ipfsP }: { ipfsP: any }) {
  const { hash } = window.location;
  const rootCIDStr =
    hash.length > 0
      ? hash.replace("#", "")
      : "baguqeeran4zdh2qzqjii34mobkgcs4mao46gxpgzmognzaexjmhchyf7chwq";
  const [ipfs, setIpfs] = React.useState<IPFS | null>(null);
  const [arPackage, setArPackage] = React.useState<World | null>(null);

  React.useEffect(() => {
    (async () => {
      const { ipfs } = await ipfsP;
      setIpfs(ipfs);
    })();
  }, [ipfsP]);

  React.useEffect(() => {
    (async () => {
      if (!ipfs) return;

      let result;

      try {
        result = await ipfs.dag.get(CID.parse(rootCIDStr), { timeout: 100 });
        console.debug("Found CAR in IPFS");
      } catch (e) {
        console.debug(`Fetching CAR from Web3.storage: ${rootCIDStr}`);
        const carResponse = await axios.get(
          `https://w3s.link/ipfs/${rootCIDStr}`,
          {
            responseType: "blob",
            headers: { Accept: "application/vnd.ipld.car" },
          }
        );
        console.debug(`Importing CAR from Web3.storage: ${rootCIDStr}`);
        const data = carResponse.data as Blob;
        const buffer = await data.arrayBuffer();
        const uintBuffer = new Uint8Array(buffer);
        ipfs.dag.import(
          (async function* () {
            yield uintBuffer;
          })()
        );

        result = await ipfs.dag.get(CID.parse(rootCIDStr));
      }
      const v = result.value as World;
      setArPackage(v);
    })();
  }, [ipfs]);

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
              <IPLDWorld ipfs={ipfs} arPackage={arPackage} />
            </XR>
          </Canvas>
        </>
      ) : null}
    </>
  );
}

export default App;
