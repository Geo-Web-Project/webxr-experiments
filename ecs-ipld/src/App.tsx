import React from "react";
import IPLDWorld, { World } from "./components/IPLDWorld";
import type { IPFS } from "ipfs-core-types";
import { default as axios } from "axios";
import { CID } from "multiformats/cid";
import { CarReader } from "@ipld/car/reader";

export const IPFS_GATEWAY_HOST = "https://w3s.link";

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
        result = await ipfs.dag.get(CID.parse(rootCIDStr), { timeout: 1000 });
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

        const reader = await CarReader.fromBytes(uintBuffer);
        for await (const { bytes } of reader.blocks()) {
          const putRes = await ipfs.block.put(bytes);
          console.debug(
            `Imported block from Web3.storage: ${putRes.toString()}`
          );
        }

        result = await ipfs.dag.get(CID.parse(rootCIDStr));
      }
      const v = result.value as World;
      setArPackage(v);
    })();
  }, [ipfs]);

  return (
    <>
      {ipfs && arPackage ? (
        <IPLDWorld ipfs={ipfs} arPackage={arPackage} />
      ) : null}
    </>
  );
}

export default App;
