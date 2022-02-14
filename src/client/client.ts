import * as THREE from "three";
import { XRHitTestSource, XRReferenceSpace, XRSession } from "three";
import { ARButton } from "three/examples/jsm/webxr/ARButton.js";
import { Group } from "three/src/objects/Group";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry, TextGeometryParameters } from "three/examples/jsm/geometries/TextGeometry.js";

let container: HTMLDivElement;
let camera: THREE.PerspectiveCamera,
    cameraTarget: THREE.Vector3,
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer;
let reticle: THREE.Mesh;
let controller: Group;
let meshItems: Array<THREE.Mesh> = [];

let group: THREE.Group,
  textMesh1: THREE.Mesh,
  textMesh2: THREE.Mesh,
  textGeo: TextGeometry,
  materials: Array<THREE.MeshPhongMaterial>;
let text = `
  Кохаю тебе 
моя Тубасічка!)
`,
  bevelEnabled = true,
  font: any = undefined,
  fontName = "adventure", // helvetiker, optimer, gentilis, droid sans, droid serif
  fontWeight = "regular"; // normal bold
const height = 1,
  size = 5,
  hover = 2,
  curveSegments = 0.4,
  bevelThickness = 0.2,
  bevelSize = 0.15;
const mirror = false;

init();
animate();

function init() {
  container = document.createElement("div");
  document.body.appendChild(container);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    30,
    window.innerWidth / window.innerHeight,
    1,
    1500
  );
  camera.position.set(0, 0, 5);

  cameraTarget = new THREE.Vector3(0, 25, 0);
  camera.lookAt( cameraTarget );

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

//   var light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
//   light.position.set(0.5, 1, 0.25);
//   scene.add(light);

  controller = renderer.xr.getController(0);
  controller.addEventListener("select", onSelect);
  scene.add(controller);

  addReticleToScene();
  loadFont();
  // ADD TEXT START

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.125);
  dirLight.position.set(0, 0, 1).normalize();
  scene.add(dirLight);

  const pointLight = new THREE.PointLight(0xffffff, 1.5);
  pointLight.position.set(0.5, 1, 0.25);
  pointLight.color.setHSL(327, 0.45, 0.49);
  scene.add(pointLight);

  materials = [
    new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true }), // front
    new THREE.MeshPhongMaterial({ color: 0xffffff }), // side
  ];
  
  // ADD TEXT END
  group = new THREE.Group();
  group.position.y = 5;
  group.position.z = -5;

  scene.add(group);

  const button = ARButton.createButton(renderer, {
    requiredFeatures: ["hit-test"], // notice a new required feature
  });
  document.body.appendChild(button);
//   renderer.domElement.style.display = "none";

  window.addEventListener("resize", onWindowResize, false);
}

function addReticleToScene() {
  const geometry = new THREE.RingBufferGeometry(0.15, 0.2, 32).rotateX(
    -Math.PI / 2
  );
  const material = new THREE.MeshBasicMaterial();

  reticle = new THREE.Mesh(geometry, material);

  // we will calculate the position and rotation of this reticle every frame manually
  // in the render() function so matrixAutoUpdate is set to false
  reticle.matrixAutoUpdate = false;
  reticle.visible = false; // we start with the reticle not visible
  scene.add(reticle);
  // optional axis helper you can add to an object
  // reticle.add(new THREE.AxesHelper(1));
}

function onSelect() {
  if (reticle.visible) {
    // cone added at the point of a hit test
    // replace the next lines to add your own object in space
    // const geometry = new THREE.CylinderBufferGeometry(0, 0.05, 0.2, 32);
    // const material = new THREE.MeshPhongMaterial({
    //   color: 0xffffff * Math.random(),
    // });
    // const mesh = new THREE.Mesh(geometry, material);
    const { vertices, trianglesIndexes } = useCoordinates();
    const { geo, material, heartMesh } = createHeartMesh(
      vertices,
      trianglesIndexes
    );

    addWireFrameToMesh(heartMesh, geo);

    // set the position of the cylinder based on where the reticle is
    heartMesh.position.setFromMatrixPosition(reticle.matrix);
    heartMesh.quaternion.setFromRotationMatrix(reticle.matrix);
    heartMesh.scale.set(0.05, 0.05, 0.05);
    meshItems.push(heartMesh);
    scene.add(heartMesh);

    // group = new THREE.Group();
    // group.position.setFromMatrixPosition(reticle.matrix);
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  renderer.setAnimationLoop(render);
}

// read more about hit testing here:
// https://github.com/immersive-web/hit-test/blob/master/hit-testing-explainer.md
// https://web.dev/ar-hit-test/

// hit testing provides the position and orientation of the intersection point, but nothing about the surfaces themselves.

let hitTestSource: XRHitTestSource | null = null;
let localSpace: XRReferenceSpace;
let hitTestSourceInitialized = false;

// This function gets called just once to initialize a hitTestSource
// The purpose of this function is to get a) a hit test source and b) a reference space
async function initializeHitTestSource() {
  const session = renderer.xr.getSession(); // XRSession

  // Reference spaces express relationships between an origin and the world.

  // For hit testing, we use the "viewer" reference space,
  // which is based on the device's pose at the time of the hit test.
  const viewerSpace = await (session as XRSession).requestReferenceSpace(
    "viewer"
  );
  hitTestSource = await (session as XRSession).requestHitTestSource({
    space: viewerSpace,
  });

  // We're going to use the reference space of "local" for drawing things.
  // which gives us stability in terms of the environment.
  // read more here: https://developer.mozilla.org/en-US/docs/Web/API/XRReferenceSpace
  localSpace = await (session as XRSession).requestReferenceSpace("local");

  // set this to true so we don't request another hit source for the rest of the session
  hitTestSourceInitialized = true;

  // In case we close the AR session by hitting the button "End AR"
  (session as XRSession).addEventListener("end", () => {
    hitTestSourceInitialized = false;
    hitTestSource = null;
  });
}

// the callback from 'setAnimationLoop' can also return a timestamp
// and an XRFrame, which provides access to the information needed in
// order to render a single frame of animation for an XRSession describing
// a VR or AR sccene.
function render(timestamp: number, frame: any) {
  if (frame) {
    // 1. create a hit test source once and keep it for all the frames
    // this gets called only once
    if (!hitTestSourceInitialized) {
      initializeHitTestSource();
    }

    // 2. get hit test results
    if (hitTestSourceInitialized) {
      // we get the hit test results for a particular frame
      const hitTestResults = frame.getHitTestResults(hitTestSource);

      // XRHitTestResults The hit test may find multiple surfaces. The first one in the array is the one closest to the camera.
      if (hitTestResults.length > 0) {
        const hit = hitTestResults[0];
        // Get a pose from the hit test result. The pose represents the pose of a point on a surface.
        const pose = hit.getPose(localSpace);

        reticle.visible = true;
        // Transform/move the reticle image to the hit test position
        reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        reticle.visible = false;
      }
    }
    meshItems.forEach((item) => (item.rotation.y -= 0.005));
    renderer.render(scene, camera);
  }
}

function useCoordinates() {
  const vertices = new Float32Array([
    0,
    0,
    0, // point C
    0,
    5,
    -1.5,
    5,
    5,
    0, // point A
    9,
    9,
    0,
    5,
    9,
    2,
    7,
    13,
    0,
    3,
    13,
    0,
    0,
    11,
    0,
    5,
    9,
    -2,
    0,
    8,
    -3,
    0,
    8,
    3,
    0,
    5,
    1.5, // point B
    -9,
    9,
    0,
    -5,
    5,
    0,
    -5,
    9,
    -2,
    -5,
    9,
    2,
    -7,
    13,
    0,
    -3,
    13,
    0,
  ]);
  const trianglesIndexes = [
    // face 1
    2,
    11,
    0, // This represents the 3 points A,B,C which compose the first triangle
    2,
    3,
    4,
    5,
    4,
    3,
    4,
    5,
    6,
    4,
    6,
    7,
    4,
    7,
    10,
    4,
    10,
    11,
    4,
    11,
    2,
    0,
    11,
    13,
    12,
    13,
    15,
    12,
    15,
    16,
    16,
    15,
    17,
    17,
    15,
    7,
    7,
    15,
    10,
    11,
    10,
    15,
    13,
    11,
    15,
    // face 2
    0,
    1,
    2,
    1,
    9,
    2,
    9,
    8,
    2,
    5,
    3,
    8,
    8,
    3,
    2,
    6,
    5,
    8,
    7,
    6,
    8,
    9,
    7,
    8,
    14,
    17,
    7,
    14,
    7,
    9,
    14,
    9,
    1,
    9,
    1,
    13,
    1,
    0,
    13,
    14,
    1,
    13,
    16,
    14,
    12,
    16,
    17,
    14,
    12,
    14,
    13,
  ];
  return {
    vertices,
    trianglesIndexes,
  };
}

function createHeartMesh(
  coordinatesList: Float32Array,
  trianglesIndexes: Array<number>
) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(coordinatesList, 3));
  geo.setIndex(trianglesIndexes);
  geo.computeVertexNormals();
  const material = new THREE.MeshPhongMaterial({ color: 0xad0c00 });
  const heartMesh = new THREE.Mesh(geo, material);
  return {
    geo,
    material,
    heartMesh,
  };
}

function addWireFrameToMesh(mesh: THREE.Mesh, geometry: THREE.BufferGeometry) {
  const wireframe = new THREE.WireframeGeometry(geometry);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x000000,
    linewidth: 2,
  });
  const line = new THREE.LineSegments(wireframe, lineMat);
  mesh.add(line);
}

// const beatingIncrement = 0.008
//   let scaleThreshold = false
//   function beatingAnimation (mesh: THREE.Mesh) {
//        // while the scale value is below the max,
//        // and the threshold is not reached, we increase it
//        if (mesh.scale.x < 1.4 && !scaleThreshold) {
//         mesh.scale.x += beatingIncrement * 2
//         mesh.scale.y += beatingIncrement * 2
//         mesh.scale.z += beatingIncrement * 2
//         // When max value is reached, the flag can be switched
//         if (mesh.scale.x >= 1.4) scaleThreshold = true
//        } else if (scaleThreshold) {
//         mesh.scale.x -= beatingIncrement
//         mesh.scale.y -= beatingIncrement
//         mesh.scale.z -= beatingIncrement
//         // The mesh got back to its initial state
//         // we can switch back the flag and go through the increasing path next time
//         if (mesh.scale.x <= 1) {
//          scaleThreshold = startAnim = false
//         }
//        }
// }

// let startAnim = false

// TEXT INIT

function loadFont() {
  const loader = new FontLoader();
  loader.load(
    "fonts/" + fontName + "_" + fontWeight + ".typeface.json",
    function (response) {
      font = response;

      refreshText();
    }
  );
}

function createText() {
  textGeo = new TextGeometry(text, {
    font: font,

    size: size,
    height: height,
    curveSegments: curveSegments,

    bevelThickness: bevelThickness,
    bevelSize: bevelSize,
    bevelEnabled: bevelEnabled,
  });

  textGeo.computeBoundingBox();

  let boundingBox = textGeo.boundingBox
    ? textGeo.boundingBox.max.x - textGeo.boundingBox.min.x
    : 1;
  
  const centerOffset = -0.5 * boundingBox;

  textMesh1 = new THREE.Mesh(textGeo, materials);

  textMesh1.position.x = centerOffset;
  textMesh1.position.y = hover;
  textMesh1.position.z = -77;

  textMesh1.rotation.x = 0;
  textMesh1.rotation.y = Math.PI * 2;

  group.add(textMesh1);

//   if (mirror) {
//     textMesh2 = new THREE.Mesh(textGeo, materials);

//     textMesh2.position.x = centerOffset;
//     textMesh2.position.y = -hover;
//     textMesh2.position.z = height;

//     textMesh2.rotation.x = Math.PI;
//     textMesh2.rotation.y = Math.PI * 2;

//     group.add(textMesh2);
//   }
}

function refreshText() {
//   group.remove(textMesh1);
//   if (mirror) group.remove(textMesh2);

  if (!text) return;

  createText();
}
