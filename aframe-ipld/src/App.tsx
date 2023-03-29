import React from "react";
import IPLDScene from "./components/IPLDScene";
import { Canvas } from "@react-three/fiber";
import { ARButton, XR } from "@react-three/xr";
import { CID } from "multiformats/cid";
import type { IPFS } from "ipfs-core-types";

function App({ ipfsP }: { ipfsP: any }) {
  const { hash } = window.location;
  const rootCIDStr =
    hash.length > 0
      ? hash.replace("#", "")
      : "baguqeerai7vhkspoeeklcl4jr5mqzpzb6tmhr2el3fhlzzebwodwpw7nayhq";
  const [ipfs, setIpfs] = React.useState<IPFS | null>(null);

  React.useEffect(() => {
    (async () => {
      const { ipfs } = await ipfsP;
      setIpfs(ipfs);
    })();
  }, [ipfsP]);

  return (
    <>
      {ipfs ? (
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
              <IPLDScene ipfs={ipfs} rootCID={CID.parse(rootCIDStr)} />
            </XR>
          </Canvas>
        </>
      ) : null}
    </>
  );
}

export default App;
