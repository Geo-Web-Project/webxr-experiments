import "aframe";
import { Entity, Scene } from "aframe-react";

export default function IPLDScene() {
  return (
    <Scene>
      <Entity
        geometry={{ primitive: "box" }}
        material={{ color: "red" }}
        position={{ x: 0, y: 0, z: -5 }}
      />
    </Scene>
  );
}
