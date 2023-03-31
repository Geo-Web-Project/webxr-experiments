import React from "react";
import { useXR } from "@react-three/xr";
import { CID } from "multiformats/cid";
import { IPFS_GATEWAY_HOST } from "../App";
import type { IPFS } from "ipfs-core-types";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { GLTF } from "three/examples/jsm/loaders/GLTFLoader";
import { default as axios } from "axios";
import {
  useECS,
  useSystem,
  useQuery,
  useAnimationFrame,
} from "@react-ecs/core";
import { ThreeView } from "@react-ecs/three";
import { Entity, Facet } from "@react-ecs/core";
import { Vector3, Quaternion } from "three";

type IPLDSceneProps = {
  arPackage: World;
  ipfs: IPFS;
};

class CIDFacet extends Facet<CIDFacet> {
  cid?: CID = undefined;
}

class GLTFFacet extends Facet<GLTFFacet> {
  glTFModel?: GLTF = undefined;
}

class Position extends Facet<Position> {
  startPosition = new Vector3(0, 0, 0);
  position?: Vector3 = undefined;
}

class Scale extends Facet<Scale> {
  startScale = new Vector3(1, 1, 1);
  scale?: Vector3 = undefined;
}

class Rotation extends Facet<Rotation> {
  startRotation = new Quaternion(0, 0, 0, 0);
  rotation?: Quaternion = undefined;
}

class Parent extends Facet<Parent> {
  parent?: CID = undefined;
}

export type World = CID[];

type VectorComponent = {
  x: number;
  y: number;
  z: number;
};
type QuaternionComponent = {
  x: number;
  y: number;
  z: number;
  w: number;
};
type EntityData = {
  glTFModel: CID;
  position?: VectorComponent;
  scale?: VectorComponent;
  rotation?: QuaternionComponent;
  parent?: CID;
};

const GLTFSystem = () => {
  const query = useQuery((e) => e.hasAll(ThreeView, GLTFFacet));

  return useSystem((_: number) => {
    query.loop([ThreeView, GLTFFacet], (_, [view, gltf]) => {
      if (gltf.glTFModel && view.object3d.visible == false) {
        view.object3d.copy(gltf.glTFModel.scene);
        view.object3d.visible = true;
      }
    });
  });
};

const ParentTransformSystem = () => {
  const query = useQuery((e) => e.hasAll(Parent, Position));
  const parentQuery = useQuery((e) => e.hasAll(ThreeView, CIDFacet, Position));

  return useSystem((_: number) => {
    query.loop([Parent, Position], (_, [parent, position]) => {
      const parentResult = parentQuery.filter(
        (e) => e.get(CIDFacet)?.cid?.equals(parent.parent) ?? false
      );
      if (parentResult.length > 0) {
        const parentTransform = parentResult[0].get(ThreeView)!.ref.current!;
        position.position = parentTransform.position.add(
          position.startPosition
        );
      }
    });
  });
};

const TransformSystem = () => {
  const query = useQuery(
    (e) => e.hasAll(ThreeView) && e.hasAny(Position, Rotation, Scale)
  );

  return useSystem((_: number) => {
    query.loop(
      [ThreeView, Position, Rotation, Scale],
      (_, [view, position, rotation, scale]) => {
        const transform = view.ref.current!;
        if (position) {
          transform.position.copy(position.position ?? position.startPosition);
        }
        if (rotation) {
          transform.quaternion.copy(
            rotation.rotation ?? rotation.startRotation
          );
        }
        if (scale) {
          transform.scale.copy(scale.scale ?? scale.startScale);
        }
        transform.updateMatrix();
      }
    );
  });
};

function Model({ ipfs, entityCID }: { ipfs: IPFS; entityCID: CID }) {
  const [gltf, setGltf] = React.useState<GLTF | null>(null);
  const [entityData, setEntityData] = React.useState<EntityData | null>(null);

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
      const entityData = result.value as EntityData;

      setEntityData(entityData);

      const loader = new GLTFLoader();
      loader.load(
        `${IPFS_GATEWAY_HOST}/ipfs/${entityData.glTFModel.toString()}`,
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

  let position: any = {};
  if (entityData && entityData.position) {
    position["startPosition"] = new Vector3(
      entityData.position.x,
      entityData.position.y,
      entityData.position.z
    );
  }

  let scale: any = {};
  if (entityData && entityData.scale) {
    scale["startScale"] = new Vector3(
      entityData.scale.x,
      entityData.scale.y,
      entityData.scale.z
    );
  }

  let rotation: any = {};
  if (entityData && entityData.rotation) {
    rotation["startRotation"] = new Quaternion(
      entityData.rotation.x,
      entityData.rotation.y,
      entityData.rotation.z,
      entityData.rotation.w
    );
  }

  return gltf && entityData ? (
    <Entity>
      {gltf ? <GLTFFacet glTFModel={gltf} /> : null}
      <CIDFacet cid={entityCID} />
      <Position {...position} />
      <Scale {...scale} />
      <Rotation {...rotation} />
      {entityData.parent ? <Parent parent={entityData.parent} /> : null}
      <ThreeView>
        <object3D matrixAutoUpdate={false} visible={false} />
      </ThreeView>
    </Entity>
  ) : null;
}

export default function IPLDWorld({ arPackage, ipfs }: IPLDSceneProps) {
  const { session } = useXR();
  const ECS = useECS();
  useAnimationFrame(ECS.update);

  if (!session) {
    return null;
  }

  return (
    <>
      <hemisphereLight groundColor={0xbbbbff} position={[0.5, 1, 0.25]} />
      <ECS.Provider>
        <GLTFSystem />
        <TransformSystem />
        <ParentTransformSystem />
        {arPackage.map((entityCID) => {
          return (
            <Model
              key={entityCID.toString()}
              entityCID={entityCID}
              ipfs={ipfs}
            />
          );
        })}
      </ECS.Provider>
    </>
  );
}
