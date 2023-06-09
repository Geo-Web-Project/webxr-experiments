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
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ARButton, XR, useXR, stopSession } from "@react-three/xr";
import { CarReader } from "@ipld/car/reader";
import { Stats, Plane } from "@react-three/drei";
import * as THREE from "three";
import { base64 } from "multiformats/bases/base64";

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

type PlaneParams = {
  width: number;
  height: number;
};

class Position extends Facet<Position> {
  startPosition: Vector3 | null = new Vector3(0, 0, 0);
  position?: Vector3 = undefined;
}

class Scale extends Facet<Scale> {
  startScale = new Vector3(1, 1, 1);
  scale?: Vector3 = undefined;
}

class Rotation extends Facet<Rotation> {
  startRotation: Quaternion | null = new Quaternion(0, 0, 0, 1);
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
  scale?: CID | VectorAnchor = undefined;
}

class IsAnchor extends Facet<IsAnchor> {
  xrAnchor?: XRAnchor = undefined;
  needsUpdate?: boolean = false;
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

class DetectedPlane extends Facet<DetectedPlane> {
  detectedPlane?: "horizontal" | "vertical" = undefined;
}

class Raycast extends Facet<Raycast> {
  origin: Vector3 = new Vector3(0, 0, 0);
  direction: Vector3 = new Vector3(0, 0, -1);
}

class ViewerPose extends Facet<ViewerPose> { }

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
type RaycastComponent = {
  origin: VectorComponent;
  direction: VectorComponent;
};
type TrackedImageComponent = {
  imageAsset?: CID;
  physicalWidthInMeters?: number;
};
type EntityData = {
  viewerPose?: boolean;
  plane?: PlaneParams;
  raycast?: RaycastComponent;
  glTFModel: CID;
  position?: VectorComponent;
  scale?: VectorComponent;
  rotation?: QuaternionComponent;
  isAnchor?: Boolean;
  trackedImage?: TrackedImageComponent;
  detectedPlane?: "horizontal" | "vertical";
  anchor?: CID | { position?: VectorAnchor; rotation?: QuaternionAnchor; scale?: VectorAnchor };
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

  return useSystem((_: number) => { });
};

/*
 * AnchorTransformSystem
 *
 * Adjust position based on Anchor
 */
const AnchorTransformSystem = () => {
  const query = useQuery((e) =>
    e.hasAll(Anchor, Position, Rotation, Scale, Visibility)
  );
  const anchorQuery = useQuery((e) =>
    e.hasAll(IsAnchor, CIDFacet, Position, Rotation, Scale)
  );

  return useSystem((_: number) => {
    query.loop(
      [Anchor, Position, Rotation, Scale, Visibility],
      (_, [anchor, position, rotation, scale, visibility]) => {
        if (!position.startPosition) return;
        if (!rotation.startRotation) return;
        if (!scale.startScale) return;

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

        let anchorScaleXCID: CID | undefined;
        let anchorScaleYCID: CID | undefined;
        let anchorScaleZCID: CID | undefined;

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
          anchorRotationWCID = anchor.anchor;
          anchorScaleXCID = anchor.anchor;
          anchorScaleYCID = anchor.anchor;
          anchorScaleZCID = anchor.anchor;
        } else {
          if (anchor.position instanceof CID) {
            anchorPositionXCID = anchor.position;
            anchorPositionYCID = anchor.position;
            anchorPositionZCID = anchor.position;
          } else if (anchor.position) {
            anchorPositionXCID = anchor.position.x;
            anchorPositionYCID = anchor.position.y;
            anchorPositionZCID = anchor.position.z;
          }

          if (anchor.rotation instanceof CID) {
            anchorRotationXCID = anchor.rotation;
            anchorRotationYCID = anchor.rotation;
            anchorRotationZCID = anchor.rotation;
            anchorRotationWCID = anchor.rotation;
          } else if (anchor.rotation) {
            anchorRotationXCID = anchor.rotation.x;
            anchorRotationYCID = anchor.rotation.y;
            anchorRotationZCID = anchor.rotation.z;
            anchorRotationWCID = anchor.rotation.w;
          }

          if (anchor.scale instanceof CID) {
            anchorScaleXCID = anchor.scale;
            anchorScaleYCID = anchor.scale;
            anchorScaleZCID = anchor.scale;
          } else if (anchor.scale) {
            anchorScaleXCID = anchor.scale.x;
            anchorScaleYCID = anchor.scale.y;
            anchorScaleZCID = anchor.scale.z;
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

        const anchorScaleX = anchorScaleXCID
          ? getAnchor(anchorScaleXCID)
          : undefined;
        const anchorScaleY = anchorScaleYCID
          ? getAnchor(anchorScaleYCID)
          : undefined;
        const anchorScaleZ = anchorScaleZCID
          ? getAnchor(anchorScaleZCID)
          : undefined;

        if (
          anchorPositionX ||
          anchorPositionY ||
          anchorPositionZ ||
          anchorRotationX ||
          anchorRotationY ||
          anchorRotationZ ||
          anchorRotationW ||
          anchorScaleX ||
          anchorScaleY ||
          anchorScaleZ
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
            1
          );

          const newScale = new Vector3(
            anchorScaleX?.get(Scale)?.scale?.x ??
            anchorScaleX?.get(Scale)?.startScale?.x ??
            1,
            anchorScaleY?.get(Scale)?.scale?.y ??
            anchorScaleY?.get(Scale)?.startScale?.y ??
            1,
            anchorScaleZ?.get(Scale)?.scale?.z ??
            anchorScaleZ?.get(Scale)?.startScale?.z ??
            1
          );

          rotation.rotation = newRotation.multiply(rotation.startRotation);
          position.position = newPosition.add(
            position.startPosition.clone().applyQuaternion(newRotation)
          );
          scale.scale = newScale.multiply(scale.startScale);

          const shouldShow = [
            anchorPositionX,
            anchorPositionY,
            anchorPositionZ,
            anchorRotationX,
            anchorRotationY,
            anchorRotationZ,
            anchorRotationW,
            anchorScaleX,
            anchorScaleY,
            anchorScaleZ
          ].reduce((prev, cur) => {
            return (
              prev &&
              (cur
                ? cur.get(Position)?.startPosition !== null &&
                cur.get(Rotation)?.startRotation !== null &&
                cur.get(Scale)?.startScale !== null
                : true)
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

  return useSystem((_: number) => { });
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

  const { session } = useXR();

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
    if (!frame || !session || !(session as any).enabledFeatures.includes("image-tracking")) return;

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

  return useSystem((_: number) => {
    if (query.length === 0 && trackedImages == null) {
      setTrackedImages([]);
    }
  });
};

/*
 * PlaneDetectionSystem
 *
 * Update startPosition and startRotation based on detectedPlane
 */
const PlaneDetectionSystem = ({
  refSpace,
}: {
  refSpace: XRReferenceSpace | null;
}) => {
  const { session } = useXR();

  const query = useQuery((e) => e.hasAll(DetectedPlane, Position, Rotation));

  useFrame((_1, _2, frame: any) => {
    if (!frame || !session || !(session as any).enabledFeatures.includes("plane-detection")) return;

    const detectedPlanes: XRPlaneSet = frame.detectedPlanes;

    query.loop(
      [DetectedPlane, Position, Rotation],
      (_, [detectedPlane, position, rotation]) => {
        const matchedPlane = Array.from(detectedPlanes).reduce(
          (prev: XRPlane | null, cur: XRPlane) => {
            if (!prev) return cur;

            if (cur.orientation.toLowerCase() === detectedPlane.detectedPlane) {
              const curPlanePose = frame.getPose(cur.planeSpace, refSpace);
              const prevPlanePose = frame.getPose(prev.planeSpace, refSpace);

              if (detectedPlane.detectedPlane === "horizontal") {
                return curPlanePose.transform.position.y <
                  prevPlanePose.transform.position.y
                  ? cur
                  : prev;
              } else {
                return curPlanePose.transform.position.z <
                  prevPlanePose.transform.position.z
                  ? cur
                  : prev;
              }
            } else {
              return prev;
            }
          },
          null
        );

        if (matchedPlane) {
          // Start position is updated as plane is detected. NOTE: anchor is currently only created once based on initial startPosition

          const planePose = frame.getPose(matchedPlane.planeSpace, refSpace);

          if (!planePose) {
            position.startPosition = null;
            rotation.startRotation = null;
            return;
          }

          const newStartPosition = new Vector3(
            planePose.transform.position.x,
            planePose.transform.position.y,
            planePose.transform.position.z
          );

          const newStartRotation = new Quaternion(
            planePose.transform.orientation.x,
            planePose.transform.orientation.y,
            planePose.transform.orientation.z,
            planePose.transform.orientation.w
          );

          position.startPosition = newStartPosition;
          rotation.startRotation = newStartRotation;
        } else {
          // No plane found, remove start position and rotation
          position.startPosition = null;
          rotation.startRotation = null;
        }
      }
    );
  });

  return useSystem((_: number) => { });
};

/*
 * RaycastSystem
 */
const RaycastSystem = ({
  refSpace,
  hitTestSource,
}: {
  refSpace: XRReferenceSpace | null;
  hitTestSource: XRHitTestSource | null;
}) => {
  const query = useQuery((e) => e.hasAll(Raycast, Position, Rotation));
  useFrame((_1, _2, frame: XRFrame) => {
    if (!frame || !hitTestSource || !refSpace) return;

    const hitTestResults: XRHitTestResult[] =
      frame.getHitTestResults(hitTestSource);

    const viewerPose = frame.getViewerPose(refSpace);

    if (hitTestResults.length > 0) {
      const pose = hitTestResults[0].getPose(refSpace);

      query.loop([Position, Rotation], (_, [position, rotation]) => {
        if (pose && viewerPose) {
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

          position.startPosition = newStartPosition;
          rotation.startRotation = newStartRotation;
        } else {
          position.startPosition = null;
          rotation.startRotation = null;
        }
      });
    }
  });

  return useSystem((_: number) => { });
};

/*
 * ViewerPoseSystem
 */
const ViewerPoseSystem = ({
  refSpace,
}: {
  refSpace: XRReferenceSpace | null;
}) => {
  const query = useQuery((e) => e.hasAll(ViewerPose, Position, Rotation));

  useFrame((_1, _2, frame: XRFrame) => {
    if (!frame || !refSpace) return;

    const viewerPose = frame.getViewerPose(refSpace);

    query.loop([Position, Rotation], (_, [position, rotation]) => {
      if (viewerPose) {
        const newStartPosition = new Vector3(
          viewerPose.transform.position.x,
          viewerPose.transform.position.y,
          viewerPose.transform.position.z
        );

        const newStartRotation = new Quaternion(
          viewerPose.transform.orientation.x,
          viewerPose.transform.orientation.y,
          viewerPose.transform.orientation.z,
          viewerPose.transform.orientation.w
        );

        position.startPosition = newStartPosition;
        rotation.startRotation = newStartRotation;
      } else {
        position.startPosition = null;
        rotation.startRotation = null;
      }
    });
  });

  return useSystem((_: number) => { });
};

/*
 * ImageScanSystem
 */
const ImageScanSystem = ({
  refSpace,
  hitTestSource,
  shouldTakeImage,
  setShouldTakeImage,
  ipfs,
  setImageToTrack
}: {
  refSpace: XRReferenceSpace | null;
  hitTestSource: XRHitTestSource | null;
  shouldTakeImage: boolean;
  setShouldTakeImage: (_: boolean) => void;
  ipfs: IPFS;
  setImageToTrack: (_: CID) => void;
}) => {
  const { camera, gl: glRenderer } = useThree();
  const { session } = useXR();

  useFrame((_1, _2, frame: XRFrame) => {
    if (!frame || !hitTestSource || !refSpace) return;

    const hitTestResults: XRHitTestResult[] =
      frame.getHitTestResults(hitTestSource);

    const viewerPose = frame.getViewerPose(refSpace);
    if (!viewerPose) return;

    const hitTestPose =
      hitTestResults.length > 0 ? hitTestResults[0].getPose(refSpace) : null;

    if (hitTestPose) {
      const hitTestPosition = new Vector3(
        hitTestPose.transform.position.x,
        hitTestPose.transform.position.y,
        hitTestPose.transform.position.z
      );
      const viewerPosition = new Vector3(
        viewerPose.transform.position.x,
        viewerPose.transform.position.y,
        viewerPose.transform.position.z
      );

      const distance = viewerPosition.distanceTo(hitTestPosition);

      const vFOV = THREE.MathUtils.degToRad(
        (camera as THREE.PerspectiveCamera).fov
      ); // convert vertical fov to radians

      const height = 2 * Math.tan(vFOV / 2) * distance * 0.25; // visible height
      const width =
        height * (camera as THREE.PerspectiveCamera).aspect * (0.75 / 0.25);
      document.getElementById("scanner-overlay")!.style.border =
        "solid 5px green";
      document.getElementById(
        "scanner-text"
      )!.innerText = `Physical Width: ${width.toFixed(3)}m`;
      document.getElementById("scanner-button")!.removeAttribute("disabled");

      const view = viewerPose.views.length > 0 ? viewerPose.views[0] : undefined;

      if (
        view &&
        session &&
        glRenderer.getContextAttributes().xrCompatible &&
        shouldTakeImage
      ) {
        setShouldTakeImage(false);

        const cam = (view as any).camera;

        const gl = glRenderer.getContext();
        const glBinding = new XRWebGLBinding(session, gl);
        const cameraTexture: WebGLTexture = (glBinding as any).getCameraImage(cam);

        const prev_framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        const framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          cameraTexture,
          0
        );

        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
          console.error("Error creating framebuffer:", status);
          return;
        }

        // Read the pixels from the framebuffer
        const pixels = new Uint8Array(cam.width * cam.height * 4);
        gl.readPixels(
          0,
          0,
          cam.width,
          cam.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels
        );
        gl.deleteFramebuffer(framebuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, prev_framebuffer);

        // Draw the pixels to a 2D canvas

        // Get the "capture-canvas"
        const imageCanvas = document.createElement(
          "canvas"
        ) as HTMLCanvasElement;
        imageCanvas.width = cam.width;
        imageCanvas.height = cam.height;
        const context = imageCanvas.getContext("2d");
        const imageData = context!.createImageData(cam.width, cam.height);
        imageData.data.set(pixels);
        context!.putImageData(imageData, 0, 0);

        // Flip image vertically
        context!.translate(0, cam.height);
        context!.scale(1, -1);
        context!.drawImage(imageCanvas, 0, 0);

        // Crop image proportional to the position and size of "scanner-overlay" in "scanner"
        const scannerOverlay = document.getElementById("scanner-overlay")!;
        const scanner = document.getElementById("scanner")!;
        const scannerOverlayRect = scannerOverlay.getBoundingClientRect();
        const scannerRect = scanner.getBoundingClientRect();
        const cropWidth = cam.width * (scannerOverlayRect.width / scannerRect.width);
        const cropHeight = cam.height * (scannerOverlayRect.height / scannerRect.height);
        const cropX = cam.width * (scannerOverlayRect.left / scannerRect.width);
        const cropY = cam.height * (scannerOverlayRect.top / scannerRect.height);
        const cropCanvas = document.createElement(
          "canvas"
        ) as HTMLCanvasElement;
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropContext = cropCanvas.getContext("2d");
        cropContext!.drawImage(
          imageCanvas,
          cropX,
          cropY,
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight
        );

        const dataUrl = cropCanvas.toDataURL("image/png");

        (async () => {
          // Convert dataUrl to base64 string
          const base64String = dataUrl.split(",")[1];
          // Decode base64 string
          const imageBytes = base64.decode('m' + base64String);

          // Add raw block to IPFS
          const imageCID = await ipfs.block.put(imageBytes, {
            format: "raw",
            mhtype: "sha2-256",
            version: 1,
          });

          const imageToTrack = {
            isAnchor: true,
            trackedImage: {
              imageAsset: imageCID,
              physicalWidthInMeters: width,
            }
          }
          console.log(imageToTrack)

          // Create IPLD block from imageToTrack
          const imageToTrackCID = await ipfs.dag.put(imageToTrack, {
            storeCodec: "dag-json",
            hashAlg: "sha2-256",
          });

          setImageToTrack(imageToTrackCID)
        })()
      }

    } else {
      document.getElementById("scanner-overlay")!.style.border =
        "solid 5px red";
      document.getElementById("scanner-text")!.innerText = `No width found`;
      document
        .getElementById("scanner-button")!
        .setAttribute("disabled", "true");
    }
  });

  return useSystem((_: number) => { });
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
          `${IPFS_GATEWAY_HOST}/ipfs/${entityCID.toString()}`,
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
          function(_gltf) {
            setGltf(_gltf);
          },
          function(xhr) {
            console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
          },
          function(error) {
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
      {entityData.plane ? (
        <>
          <Visibility isVisible={true} />
          <Scale {...scale} />
          <Rotation {...rotation} />
          <Position {...position} />
          <ThreeView>
            <Plane args={[entityData.plane.width, entityData.plane.height]} />
          </ThreeView>
        </>
      ) : null}
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
          <Scale
            {...scale}
            startScale={scale.startScale ?? null}
          />
        </>
      ) : null}
      {entityData.detectedPlane ? (
        <>
          <DetectedPlane detectedPlane={entityData.detectedPlane} />
          <Position
            {...position}
            startPosition={position.startPosition ?? null}
          />
          <Rotation
            {...rotation}
            startRotation={rotation.startRotation ?? null}
          />
          <Scale
            {...scale}
            startScale={scale.startScale ?? null}
          />
        </>
      ) : null}
      {entityData.raycast ? (
        <>
          <Raycast
            origin={
              new Vector3(
                entityData.raycast.origin.x,
                entityData.raycast.origin.y,
                entityData.raycast.origin.z
              )
            }
            direction={
              new Vector3(
                entityData.raycast.direction.x,
                entityData.raycast.direction.y,
                entityData.raycast.direction.z
              )
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
          <Scale
            {...scale}
            startScale={scale.startScale ?? null}
          />
        </>
      ) : null}
      {entityData.viewerPose == true ? (
        <>
          <ViewerPose />
          <Position
            {...position}
            startPosition={position.startPosition ?? null}
          />
          <Rotation
            {...rotation}
            startRotation={rotation.startRotation ?? null}
          />
          <Scale
            {...scale}
            startScale={scale.startScale ?? null}
          />
        </>
      ) : null}
    </Entity>
  ) : null;
}

type IPLDWorldCanvasProps = IPLDSceneProps & {
  trackedImages: TrackedImageProps[] | null;
  setTrackedImages: (i: TrackedImageProps[]) => void;
  showWorld: boolean;
  setShowWorld: (i: boolean) => void;
  children?: React.ReactNode;
  shouldTakeImage: boolean;
  setShouldTakeImage: (_: boolean) => void;
  setImageToTrack: (_: CID) => void;
};

function IPLDWorldCanvas({
  arPackage,
  ipfs,
  trackedImages,
  setTrackedImages,
  showWorld,
  setShowWorld,
  children,
  shouldTakeImage,
  setShouldTakeImage,
  setImageToTrack
}: IPLDWorldCanvasProps) {
  const [refSpace, setRefSpace] = React.useState<XRReferenceSpace | null>(null);
  const [hitTestSource, setHitTestSource] =
    React.useState<XRHitTestSource | null>(null);

  async function onSessionStart({ target }: { target: XRSession }) {
    setShowWorld(true);

    const localRefSpace = await target.requestReferenceSpace("local");
    setRefSpace(localRefSpace);

    const viewerRefSpace = await target.requestReferenceSpace("viewer");
    const hitTestSource = await target.requestHitTestSource!({
      space: viewerRefSpace,
    });
    setHitTestSource(hitTestSource ?? null);

    const stats = document.getElementsByClassName("stats");
    if (stats.length > 0) {
      (stats[0] as HTMLElement).style.cssText =
        "position:fixed;top:20;left:0;cursor:pointer;opacity:0.9;z-index:10000";
    }
  }

  async function onSessionEnd() {
    setShowWorld(false);
    setRefSpace(null);
    setHitTestSource(null);
  }

  return (
    <XR
      referenceSpace="local"
      onSessionStart={onSessionStart}
      onSessionEnd={onSessionEnd}
    >
      <directionalLight color={0xffffff} intensity={0.5} />
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
      <PlaneDetectionSystem refSpace={refSpace} />
      <RaycastSystem refSpace={refSpace} hitTestSource={hitTestSource} />
      {arPackage.length === 0 ? <ImageScanSystem
        refSpace={refSpace}
        setImageToTrack={setImageToTrack}
        ipfs={ipfs}
        hitTestSource={hitTestSource}
        shouldTakeImage={shouldTakeImage}
        setShouldTakeImage={setShouldTakeImage}
      /> : null}
      <ViewerPoseSystem refSpace={refSpace} />
      {arPackage.map((entityCID) => {
        return (
          <Model key={entityCID.toString()} entityCID={entityCID} ipfs={ipfs} />
        );
      })}
      {children}
    </XR>
  );
}

function ImageScanOverlay({
  setShouldTakeImage,
}: {
  setShouldTakeImage: (_: boolean) => void;
}) {
  return (
    <>
      <div
        id="scanner"
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <div
          id="scanner-overlay"
          style={{
            width: "75%",
            height: "25%",
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            border: "5px solid red",
          }}
        ></div>
        <div
          id="scanner-text"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.8)", color: "white" }}
        ></div>
        <button
          id="scanner-button"
          disabled
          style={{
            marginTop: "100px",
            padding: "12px 24px",
            border: "1px solid white",
            borderRadius: "4px",
            background: "rgba(0, 0, 0, 0.1)",
            color: "white",
            font: "0.8125rem sans-serif",
            outline: "none",
            zIndex: "99999",
            cursor: "pointer",
          }}
          onTouchEnd={(e) => {
            setShouldTakeImage(true);
            e.preventDefault();
          }}
        >
          Take Image
        </button>
      </div>
    </>
  );
}

export default function IPLDWorld({ ipfs }: IPLDSceneProps) {
  const ECS = useECS();

  useAnimationFrame(ECS.update);

  const [trackedImages, setTrackedImages] = React.useState<
    TrackedImageProps[] | null
  >(null);
  const [showWorld, setShowWorld] = React.useState(false);
  const [shouldTakeImage, setShouldTakeImage] = React.useState(false);
  const [imageToTrack, setImageToTrack] = React.useState<CID | null>(null);
  const [arPackage, setARPackage] = React.useState<World>([]);

  React.useEffect(() => {

    (async () => {
      if (imageToTrack) {
        const testObject = {
          anchor: imageToTrack,
          rotation: {
            x: -0.7071067,
            y: 0,
            z: 0,
            w: 0.7071069
          },
          plane: {
            width: 0.3,
            height: 0.3
          }
        }

        // Add object to IPFS as dag-json
        const testObjectCID = await ipfs.dag.put(testObject, { storeCodec: "dag-json", hashAlg: "sha2-256" })

        setARPackage([testObjectCID, imageToTrack])
        setImageToTrack(null)
        stopSession()
      }


    })()

  }, [imageToTrack])

  const overlayRef = React.useRef(document.createElement("div"));

  return (
    <ECS.Provider>
      <div
        id="overlay"
        ref={overlayRef}
      >
        {showWorld && arPackage.length === 0 ? (
          <ImageScanOverlay setShouldTakeImage={setShouldTakeImage} />
        ) : null}
        {trackedImages ? (
          <ARButton
            sessionInit={
              {
                requiredFeatures: [
                  "local",
                  "hit-test",
                  "anchors",
                  "dom-overlay",
                  "camera-access",
                ],
                optionalFeatures: ["plane-detection", "image-tracking"],
                trackedImages: trackedImages,
                domOverlay: { root: document.getElementById("overlay") },
              } as any
            }
          />
        ) : null}
      </div>
      {
        <Canvas
          id="xr-canvas"
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
            showWorld={showWorld}
            setShowWorld={setShowWorld}
            shouldTakeImage={shouldTakeImage}
            setShouldTakeImage={setShouldTakeImage}
            setImageToTrack={setImageToTrack}
          >
          </IPLDWorldCanvas>
        </Canvas>
      }
      <Stats showPanel={0} className="stats" parent={overlayRef} />
    </ECS.Provider>
  );
}
