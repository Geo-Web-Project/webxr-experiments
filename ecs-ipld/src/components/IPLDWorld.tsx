import React from "react";
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
import { Canvas, useFrame } from "@react-three/fiber";
import { ARButton, XR } from "@react-three/xr";
import { CarReader } from "@ipld/car/reader";

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
  startPosition: Vector3 | null = new Vector3(0, 0, 0);
  position?: Vector3 = undefined;
}

class Scale extends Facet<Scale> {
  startScale = new Vector3(1, 1, 1);
  scale?: Vector3 = undefined;
}

class Rotation extends Facet<Rotation> {
  startRotation: Quaternion | null = new Quaternion(0, 0, 0, 0);
  rotation?: Quaternion = undefined;
}

type VectorAnchor = {
  x?: CID;
  y?: CID;
  z?: CID;
};

type QuaternionAnchor = {
  x?: CID;
  y?: CID;
  z?: CID;
  w?: CID;
};

class Anchor extends Facet<Anchor> {
  anchor?: CID = undefined;
  position?: CID | VectorAnchor = undefined;
  rotation?: CID | QuaternionAnchor = undefined;
}

class IsAnchor extends Facet<IsAnchor> {
  xrAnchor?: XRAnchor = undefined;
  needsUpdate: boolean = false;
}

class Visibility extends Facet<Visibility> {
  isVisible?: boolean = true;
}

class TrackedImage extends Facet<TrackedImage> {
  imageAsset?: CID = undefined;
  imageBitmap?: ImageBitmap = undefined;
  physicalWidthInMeters?: number = undefined;
  imageTrackingIndex?: number = undefined;
}

type TrackedImageProps = {
  image: ImageBitmap;
  widthInMeters: number;
};

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
type TrackedImageComponent = {
  imageAsset?: CID;
  physicalWidthInMeters?: number;
};
type EntityData = {
  glTFModel: CID;
  position?: VectorComponent;
  scale?: VectorComponent;
  rotation?: QuaternionComponent;
  isAnchor?: Boolean;
  trackedImage?: TrackedImageComponent;
  anchor?: CID | { position?: VectorAnchor; rotation?: QuaternionAnchor };
};

/*
 * GLTFSystem
 *
 * GLTFFacet -> ThreeView
 */
const GLTFSystem = () => {
  useQuery((e) => e.hasAll(ThreeView, GLTFFacet), {
    added: (e) => {
      const gltf = e.current.get(GLTFFacet)!;
      const view = e.current.get(ThreeView)!;

      if (gltf.glTFModel) {
        view.object3d.copy(gltf.glTFModel.scene);
      }
    },
  });

  return useSystem((_: number) => {});
};

/*
 * AnchorTransformSystem
 *
 * Adjust position based on Anchor
 */
const AnchorTransformSystem = () => {
  const query = useQuery((e) =>
    e.hasAll(Anchor, Position, Rotation, Visibility)
  );
  const anchorQuery = useQuery((e) =>
    e.hasAll(IsAnchor, CIDFacet, Position, Rotation)
  );

  return useSystem((_: number) => {
    query.loop(
      [Anchor, Position, Rotation, Visibility],
      (_, [anchor, position, rotation, visibility]) => {
        if (!position.startPosition) return;
        if (!rotation.startRotation) return;

        const getAnchor = (anchorCID: CID) => {
          const results = anchorQuery.filter(
            (e) => e.get(CIDFacet)?.cid?.equals(anchorCID) ?? false
          );

          return results.length > 0 ? results[0] : null;
        };

        let anchorPositionXCID: CID | undefined;
        let anchorPositionYCID: CID | undefined;
        let anchorPositionZCID: CID | undefined;

        let anchorRotationXCID: CID | undefined;
        let anchorRotationYCID: CID | undefined;
        let anchorRotationZCID: CID | undefined;
        let anchorRotationWCID: CID | undefined;

        // 1. Anchor.anchor
        // 2. Anchor.position
        // 3. Anchor.position.coord
        if (anchor.anchor) {
          anchorPositionXCID = anchor.anchor;
          anchorPositionYCID = anchor.anchor;
          anchorPositionZCID = anchor.anchor;
          anchorRotationXCID = anchor.anchor;
          anchorRotationYCID = anchor.anchor;
          anchorRotationZCID = anchor.anchor;
        } else {
          if (anchor.position instanceof CID) {
            anchorPositionXCID = anchor.position;
            anchorPositionYCID = anchor.position;
            anchorPositionZCID = anchor.position;
          } else {
            anchorPositionXCID = anchor.position.x;
            anchorPositionYCID = anchor.position.y;
            anchorPositionZCID = anchor.position.z;
          }

          if (anchor.rotation instanceof CID) {
            anchorRotationXCID = anchor.rotation;
            anchorRotationYCID = anchor.rotation;
            anchorRotationZCID = anchor.rotation;
          } else {
            anchorRotationXCID = anchor.rotation.x;
            anchorRotationYCID = anchor.rotation.y;
            anchorRotationZCID = anchor.rotation.z;
            anchorRotationWCID = anchor.rotation.w;
          }
        }

        // null -> not found
        // undefined -> no anchor
        const anchorPositionX = anchorPositionXCID
          ? getAnchor(anchorPositionXCID)
          : undefined;
        const anchorPositionY = anchorPositionYCID
          ? getAnchor(anchorPositionYCID)
          : undefined;
        const anchorPositionZ = anchorPositionZCID
          ? getAnchor(anchorPositionZCID)
          : undefined;

        const anchorRotationX = anchorRotationXCID
          ? getAnchor(anchorRotationXCID)
          : undefined;
        const anchorRotationY = anchorRotationYCID
          ? getAnchor(anchorRotationYCID)
          : undefined;
        const anchorRotationZ = anchorRotationZCID
          ? getAnchor(anchorRotationZCID)
          : undefined;
        const anchorRotationW = anchorRotationWCID
          ? getAnchor(anchorRotationWCID)
          : undefined;

        if (
          anchorPositionX ||
          anchorPositionY ||
          anchorPositionZ ||
          anchorRotationX ||
          anchorRotationY ||
          anchorRotationZ ||
          anchorRotationW
        ) {
          const newPosition = new Vector3(
            anchorPositionX?.get(Position)?.position?.x ??
              anchorPositionX?.get(Position)?.startPosition?.x ??
              0,
            anchorPositionY?.get(Position)?.position?.y ??
              anchorPositionY?.get(Position)?.startPosition?.y ??
              0,
            anchorPositionZ?.get(Position)?.position?.z ??
              anchorPositionZ?.get(Position)?.startPosition?.z ??
              0
          );

          const newRotation = new Quaternion(
            anchorRotationX?.get(Rotation)?.rotation?.x ??
              anchorRotationX?.get(Rotation)?.startRotation?.x ??
              0,
            anchorRotationY?.get(Rotation)?.rotation?.y ??
              anchorRotationY?.get(Rotation)?.startRotation?.y ??
              0,
            anchorRotationZ?.get(Rotation)?.rotation?.z ??
              anchorRotationZ?.get(Rotation)?.startRotation?.z ??
              0,
            anchorRotationW?.get(Rotation)?.rotation?.w ??
              anchorRotationW?.get(Rotation)?.startRotation?.w ??
              0
          );

          position.position = newPosition.add(position.startPosition);
          rotation.rotation = new Quaternion(
            newRotation.x + rotation.startRotation.x,
            newRotation.y + rotation.startRotation.y,
            newRotation.z + rotation.startRotation.z,
            newRotation.w + rotation.startRotation.w
          );

          const shouldShow = [
            anchorPositionX,
            anchorPositionY,
            anchorPositionZ,
            anchorRotationX,
            anchorRotationY,
            anchorRotationZ,
            anchorRotationW,
          ].reduce((prev, cur) => {
            return (
              prev && (cur ? cur.get(IsAnchor)?.xrAnchor !== undefined : true)
            );
          }, true);

          if (shouldShow) {
            visibility.isVisible = true;
          }
        } else {
          // Did not find anchor, mark not visible
          visibility.isVisible = false;
        }
      }
    );
  });
};

/*
 * TransformSystem
 *
 * Position, Rotation, Scale, Visibility -> ThreeView
 */
const TransformSystem = ({ showWorld }: { showWorld: boolean }) => {
  const query = useQuery(
    (e) =>
      e.hasAll(ThreeView) && e.hasAny(Position, Rotation, Scale, Visibility)
  );

  return useSystem((_: number) => {
    query.loop(
      [ThreeView, Position, Rotation, Scale, Visibility],
      (_, [view, position, rotation, scale, visibility]) => {
        const transform = view.ref.current!;
        transform.visible = visibility.isVisible && showWorld;
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

/*
 * IsAnchorSystem
 *
 * IsAnchor -> WebXR anchor
 */
const IsAnchorSystem = ({
  refSpace,
}: {
  refSpace: XRReferenceSpace | null;
}) => {
  const query = useQuery((e) => e.hasAll(IsAnchor, Position, Rotation));

  useFrame((_1, _2, frame: XRFrame) => {
    if (!frame) return;

    query.loop(
      [IsAnchor, Position, Rotation],
      (_, [isAnchor, position, rotation]) => {
        if (!refSpace) return;

        if (!position.startPosition) return;
        if (!rotation.startRotation) return;

        if (
          isAnchor.needsUpdate ||
          (!isAnchor.xrAnchor && !position.position && !rotation.rotation)
        ) {
          // Create anchor at startPosition

          if (!frame.createAnchor) return;

          if (isAnchor.needsUpdate) {
            isAnchor.xrAnchor?.delete();
            isAnchor.needsUpdate = false;
          }

          const pose = new XRRigidTransform(
            {
              x: position.startPosition.x ?? 0,
              y: position.startPosition.y ?? 0,
              z: position.startPosition.z ?? 0,
              w: 1.0,
            },
            {
              w: rotation.startRotation.w ?? 1.0,
              x: rotation.startRotation.x ?? 0,
              y: rotation.startRotation.y ?? 0,
              z: rotation.startRotation.z ?? 0,
            }
          );

          // position.position = position.startPosition;
          // rotation.rotation = rotation.startRotation;

          // Is creating an XRAnchor actually needed?
          frame.createAnchor(pose, refSpace)?.then(
            (anchor) => {
              console.debug("Created anchor: ", pose);
              isAnchor.xrAnchor = anchor;
            },
            (error) => {
              console.error("Could not create anchor: " + error);
            }
          );
        }
        //         else if (isAnchor.xrAnchor) {
        //           // Update position with anchor pose
        //           const pose = frame.getPose(isAnchor.xrAnchor.anchorSpace, refSpace);
        //
        //           if (pose) {
        //             position.position = new Vector3(
        //               pose.transform.position.x,
        //               pose.transform.position.y,
        //               pose.transform.position.z
        //             );
        //             rotation.rotation = new Quaternion(
        //               pose.transform.orientation.x,
        //               pose.transform.orientation.y,
        //               pose.transform.orientation.z,
        //               pose.transform.orientation.w
        //             );
        //           }
        //         }
      }
    );
  });

  return useSystem((_: number) => {});
};

/*
 * ImageTrackingSystem
 *
 * setTrackedImages from TrackedImage
 * Update startPosition and startRotation based on physical location in XR view
 */
const ImageTrackingSystem = ({
  trackedImages,
  setTrackedImages,
  refSpace,
  ipfs,
}: {
  trackedImages: TrackedImageProps[] | null;
  setTrackedImages: (i: TrackedImageProps[]) => void;
  refSpace: XRReferenceSpace | null;
  ipfs: IPFS;
}) => {
  const query = useQuery((e) => e.hasAll(TrackedImage, Position, Rotation), {
    added: (e) => {
      const v = e.current.get(TrackedImage)!;

      // Download image asset
      (async () => {
        let catBlob: Blob;
        try {
          await ipfs.block.get(v.imageAsset!, { timeout: 2000 });

          const imgData = ipfs.cat(v.imageAsset!);
          let catBytes: Uint8Array[] = [];
          for await (const bytes of imgData) {
            catBytes = [...catBytes, bytes];
          }
          catBlob = new Blob(catBytes);
        } catch (e) {
          console.debug(
            `Fetching CAR from Web3.storage: ${v.imageAsset!.toString()}`
          );
          const carResponse = await axios.get(
            `https://w3s.link/ipfs/${v.imageAsset!.toString()}`,
            {
              responseType: "blob",
              headers: { Accept: "application/vnd.ipld.car" },
            }
          );
          console.debug(
            `Importing CAR from Web3.storage: ${v.imageAsset!.toString()}`
          );
          const data = carResponse.data as Blob;
          const buffer = await data.arrayBuffer();
          const uintBuffer = new Uint8Array(buffer);

          const reader = await CarReader.fromBytes(uintBuffer);
          for await (const { bytes } of reader.blocks()) {
            await ipfs.block.put(bytes);
          }

          const imgData = ipfs.cat(v.imageAsset!);
          let catBytes: Uint8Array[] = [];
          for await (const bytes of imgData) {
            catBytes = [...catBytes, bytes];
          }
          catBlob = new Blob(catBytes);
        }

        console.log("FOUND: ", v.imageAsset!.toString());

        const trackedImage: TrackedImageProps = {
          widthInMeters: v.physicalWidthInMeters!,
          image: await createImageBitmap(catBlob),
        };
        v.imageBitmap = trackedImage.image;

        const newTrackedImages = [...(trackedImages ?? []), trackedImage];
        setTrackedImages(newTrackedImages);

        v.imageTrackingIndex = newTrackedImages.indexOf(trackedImage);
      })();
    },
  });

  useFrame((_1, _2, frame: any) => {
    if (!frame) return;

    const imageTrackingResults: any[] = frame.getImageTrackingResults();

    query.loop(
      [TrackedImage, Position, Rotation],
      (_, [trackedImage, position, rotation]) => {
        if (trackedImage.imageTrackingIndex === undefined) return;

        const result = imageTrackingResults.find(
          (v) => v.index === trackedImage.imageTrackingIndex
        );

        if (!result) return;

        const pose = frame.getPose(result.imageSpace, refSpace);
        const state = result.trackingState;

        if (state == "tracked" || state == "emulated") {
          // Start position is updated as image is tracked. NOTE: anchor is currently only created once based on initial startPosition

          const newStartPosition = new Vector3(
            pose.transform.position.x,
            pose.transform.position.y,
            pose.transform.position.z
          );

          const newStartRotation = new Quaternion(
            pose.transform.orientation.x,
            pose.transform.orientation.y,
            pose.transform.orientation.z,
            pose.transform.orientation.w
          );

          //           const isAnchor = e.get(IsAnchor);
          //
          //           const positionNeedsUpdate =
          //             !position.startPosition ||
          //             !newStartPosition.equals(position.startPosition);
          //           const rotationNeedsUpdate =
          //             !rotation.startRotation ||
          //             !newStartRotation.equals(rotation.startRotation);
          //           if (isAnchor && (positionNeedsUpdate || rotationNeedsUpdate)) {
          //             // Mark anchor for update
          //             isAnchor.needsUpdate = true;
          //           }

          position.startPosition = newStartPosition;
          rotation.startRotation = newStartRotation;
        }
      }
    );
  });

  return useSystem((_: number) => {});
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

        const reader = await CarReader.fromBytes(uintBuffer);
        const block = await reader.get(entityCID);
        const putRes = await ipfs.block.put(block!.bytes);
        console.debug(`Imported CAR from Web3.storage: ${putRes.toString()}`);

        result = await ipfs.dag.get(entityCID);
      }

      console.log("FOUND: ", entityCID.toString());
      const entityData = result.value as EntityData;

      setEntityData(entityData);

      if (entityData.glTFModel) {
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

  return entityData ? (
    <Entity>
      <CIDFacet cid={entityCID} />
      {gltf ? (
        <>
          <GLTFFacet glTFModel={gltf} />
          <Visibility isVisible={false} />
          <Scale {...scale} />
          <Rotation {...rotation} />
          <Position {...position} />
          <ThreeView>
            <object3D matrixAutoUpdate={false} visible={false} />
          </ThreeView>
        </>
      ) : null}
      {entityData.anchor ? (
        <Anchor
          anchor={
            entityData.anchor instanceof CID ? entityData.anchor : undefined
          }
          position={
            !(entityData.anchor instanceof CID)
              ? entityData.anchor.position
              : undefined
          }
          rotation={
            !(entityData.anchor instanceof CID)
              ? entityData.anchor.rotation
              : undefined
          }
        />
      ) : null}
      {entityData.isAnchor ? (
        <>
          <IsAnchor />
          {entityData.scale ? <Scale {...scale} /> : null}
          {entityData.rotation ? <Rotation {...rotation} /> : null}
          {entityData.position ? <Position {...position} /> : null}
        </>
      ) : null}
      {entityData.trackedImage ? (
        <>
          <TrackedImage
            imageAsset={entityData.trackedImage.imageAsset}
            physicalWidthInMeters={
              entityData.trackedImage.physicalWidthInMeters
            }
          />
          <Position
            {...position}
            startPosition={position.startPosition ?? null}
          />
          <Rotation
            {...rotation}
            startRotation={rotation.startRotation ?? null}
          />
        </>
      ) : null}
    </Entity>
  ) : null;
}

type IPLDWorldCanvasProps = IPLDSceneProps & {
  trackedImages: TrackedImageProps[] | null;
  setTrackedImages: (i: TrackedImageProps[]) => void;
};

function IPLDWorldCanvas({
  arPackage,
  ipfs,
  trackedImages,
  setTrackedImages,
}: IPLDWorldCanvasProps) {
  const ECS = useECS();

  useAnimationFrame(ECS.update);

  const [showWorld, setShowWorld] = React.useState(false);
  const [refSpace, setRefSpace] = React.useState<XRReferenceSpace | null>(null);

  function onSessionStart({ target }: { target: XRSession }) {
    setShowWorld(true);

    target.requestReferenceSpace("local").then((refSpace) => {
      setRefSpace(refSpace);
    });
  }

  return (
    <ECS.Provider>
      <XR referenceSpace="local" onSessionStart={onSessionStart}>
        <hemisphereLight groundColor={0xbbbbff} position={[0.5, 1, 0.25]} />
        <GLTFSystem />
        <TransformSystem showWorld={showWorld} />
        <AnchorTransformSystem />
        <IsAnchorSystem refSpace={refSpace} />
        <ImageTrackingSystem
          trackedImages={trackedImages}
          setTrackedImages={setTrackedImages}
          refSpace={refSpace}
          ipfs={ipfs}
        />
        {arPackage.map((entityCID) => {
          return (
            <Model
              key={entityCID.toString()}
              entityCID={entityCID}
              ipfs={ipfs}
            />
          );
        })}
      </XR>
    </ECS.Provider>
  );
}

export default function IPLDWorld({ arPackage, ipfs }: IPLDSceneProps) {
  const [trackedImages, setTrackedImages] =
    React.useState<TrackedImageProps[] | null>(null);

  return (
    <>
      {trackedImages ? (
        <ARButton
          sessionInit={
            {
              requiredFeatures: [
                "local",
                "hit-test",
                "image-tracking",
                "anchors",
                // "plane-detection",
              ],
              trackedImages: trackedImages,
            } as any
          }
        />
      ) : null}
      <Canvas
        camera={{
          fov: 70,
          aspect: window.innerWidth / window.innerHeight,
          near: 0.01,
          far: 20,
        }}
      >
        <IPLDWorldCanvas
          ipfs={ipfs}
          arPackage={arPackage}
          trackedImages={trackedImages}
          setTrackedImages={setTrackedImages}
        />
      </Canvas>
    </>
  );
}
