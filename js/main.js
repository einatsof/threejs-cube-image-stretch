import * as THREE from 'three';
import PerspT from 'perspective-transform';
import {OrbitControls} from 'https://unpkg.com/three@0.142.0/examples/jsm/controls/OrbitControls.js';
import {TransformControls} from 'https://unpkg.com/three@0.142.0/examples/jsm/controls/TransformControls.js';
import {DragControls} from 'https://unpkg.com/three@0.142.0/examples/jsm/controls/DragControls.js';
import {GUI} from 'https://unpkg.com/three@0.142.0/examples/jsm/libs/lil-gui.module.min.js';
import {GLTFExporter} from 'https://unpkg.com/three@0.142.0/examples/jsm/exporters/GLTFExporter.js';


let scene, renderer, camera, control, orbit, raycaster, pointer;
let gui, gridHelper, axes;
let cubeMaterials = [], controlPoints = [], colorsBackup = [], destPts = [];
let cube, currFace, selectedFace, selectedFaceNormal, selectedFaceHighlight, pickPlane, controlShape, currImage, coeffs;
let shapeFolder, wrapFolder, exportFolder;

const params = {
  showSceneControls: true,
  stage: 1,
  fov: 45,
  axes: true,
  grid: true,
  spin: false,
  bgcolor: 'black',
  next: function () {   
    shapeDesignFinished();
  },
  color: new THREE.Color('#ffffff'),
  upload: function () {
    document.getElementById('input').click();
  },
  rotate: function () {
    if (destPts.length > 0){
      destPts = destPts.slice(2).concat(destPts.slice(0, 2));
      calculateMatrix();
      updateFaceMaterial();
    }  
  },
  vFlip: function () {
    if (destPts.length > 0){
      destPts = destPts.slice(-2).concat(destPts.slice(-4, -2), destPts.slice(2, 4), destPts.slice(0, 2));
      calculateMatrix();
      updateFaceMaterial();
    }  
  },
  hFlip: function () {
    if (destPts.length > 0){
      destPts = destPts.slice(2, 4).concat(destPts.slice(0, 2), destPts.slice(-2), destPts.slice(-4, -2));
      calculateMatrix();
      updateFaceMaterial();
    }  
  },
  finish: function () {
    faceDesignFinished();
  },
  exportCube: function () {
    exportGLTF(cube);  
  },
  trs: false,
  binary: false
};

init();
animate();

function init() {

  renderer = new THREE.WebGLRenderer();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  document.body.appendChild(renderer.domElement);

  // Camera
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.PerspectiveCamera(50, aspect, 0.01, 30000);
  camera.position.set(4, 4, 4);
  camera.lookAt(0, 0, 0);

  // Grid helper
  scene = new THREE.Scene();
  gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0x444444);
  scene.add(gridHelper);

  // Axis helper
  axes = new THREE.AxesHelper(10);
  axes.name = 'AxesHelper';
  scene.add(axes);

  // Lights
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 1);
  scene.add(light);
  const light2 = new THREE.DirectionalLight(0xffffff, 0.7);
  light2.position.set(-1, 1, -1);
  scene.add(light2);
  const light3 = new THREE.DirectionalLight(0xffffff, 0.3);
  light3.position.set(1, -1, -1);
  scene.add(light3);
  
  // Orbit controls
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.update();
  orbit.addEventListener('change', render);

  // Transform controls
  control = new TransformControls(camera, renderer.domElement);
  control.mode = 'scale';
  control.setSize(0.75);
  control.addEventListener('change', render);
  control.addEventListener('dragging-changed', function (event) {
    orbit.enabled = !event.value;
  });

  // Raycaster
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2(-1, 1);

  // Cube
  //  cubeMaterials order:
  //   Positive X - normal ( 1, 0, 0), Negative X - normal (-1, 0, 0), Positive Y - normal ( 0, 1, 0), 
  //   Negative Y - normal ( 0,-1, 0), Positive Z - normal ( 0, 0, 1), Negative Z - normal ( 0, 0,-1)
  let cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 6; i++) {
    let color = new THREE.Color(0xffffff);
    colorsBackup.push(color);
    cubeMaterials.push(createFaceMaterial(color, 0.7));
  }
  cube = new THREE.Mesh(cubeGeometry, cubeMaterials);
  cube.name = "cube";
  scene.add(cube);
  control.attach(cube);
  scene.add(control);

  // Control points listeners
  let dragControls = new DragControls(controlPoints, camera, renderer.domElement);
  dragControls.addEventListener("dragstart", function (event) {
    orbit.enabled = false;
  });

  dragControls.addEventListener ('drag', function (event) {
    // Stay on pick plane
    let max = pickPlane.geometry.boundingBox.max;
    let min = pickPlane.geometry.boundingBox.min;
    if (selectedFaceNormal.x != 0) {
      event.object.position.x = max.x * 1.01;
    } else {
      if (event.object.position.x < min.x) {
        event.object.position.x = min.x;
      } else if (event.object.position.x > max.x) {
        event.object.position.x = max.x;
      }
    }
    if (selectedFaceNormal.y != 0) {
      event.object.position.y = max.y * 1.01;
    } else {
      if (event.object.position.y < min.y) {
        event.object.position.y = min.y;
      } else if (event.object.position.y > max.y) {
        event.object.position.y = max.y;
      }
    }
    if (selectedFaceNormal.z != 0) {
      event.object.position.z = max.z * 1.01;
    } else {
      if (event.object.position.z < min.z) {
        event.object.position.z = min.z;
      } else if (event.object.position.z > max.z) {
        event.object.position.z = max.z;
      }
    }
  });

  dragControls.addEventListener("dragend", function (event) {
    orbit.enabled = true;
    // Change controlShape
    controlShape.geometry = lineGeometryFromPoints(controlPoints[0].position, controlPoints[1].position, controlPoints[2].position, controlPoints[3].position).clone();
    controlShape.geometry.attributes.position.needsUpdate = true;
    // Update cube face material
    calculateMatrix();
    updateFaceMaterial();
  });

  // Event Listeners
  window.addEventListener('resize', onWindowResize);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('click', onClick);
  window.addEventListener('touchstart', onMouseMove); // Mobile support
  window.addEventListener('touchend', onClick);       // Mobile support
  document.getElementById('input').addEventListener("change", handleFiles, false);

  // GUI
  createGUI();

  // Instructions
  document.getElementById('info').innerHTML = "Instructions: transform cube to desired shape and click \"Next\"";
  hideImageOptions();
}

/**
 * Change camera and renderer in the event of window resizing
 */
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  render();
}

/**
 * Animate
 */
function animate() {
  // Things that work only on 2nd stage
  if (params.stage == 2) {
    // Hovering on faces animation
    resetMaterials();
    hoverFace();
  }

  requestAnimationFrame(animate);
  orbit.update();
  render();
}

/**
 * Render
 */
function render() {
  renderer.render( scene, camera );
}


/**
 * Create a simple material with color
 * 
 * @param {THREE.Color} color
 * 
 * @return {THREE.MeshStandardMaterial} The new material with specified color
 */
function createFaceMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: color,
    transparent: true,
    opacity: 0.7
  });
}

/**
 * Apply perspective transform on an image data, draw it on a canvas and use it as a texture for a material
 *
 * @param {THREE.Color}   color
 * 
 * @return {THREE.MeshStandardMaterial} The new material with transformed image as a texture
 */
function createImageFaceMaterial(color) {
  const ctx = document.createElement('canvas').getContext('2d');
  let width = currImage.width;
  let height = currImage.height;
  ctx.canvas.width = width;
  ctx.canvas.height = height;
  ctx.drawImage(currImage, 0, 0);
  const originalImageData = ctx.getImageData(0, 0, width, height);
  let newImagedata = ctx.createImageData(width, height);
  // Loop over all of the pixels
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      // Get the pixel index
      var pixelindex = (y * width + x) * 4;

      let oX = coeffs[0] * x + coeffs[1] * y + coeffs[2];
      let oY = coeffs[3] * x + coeffs[4] * y + coeffs[5];
      let oZ = coeffs[6] * x + coeffs[7] * y + 1;
      oX = Math.round(oX / oZ);
      oY = Math.round(oY / oZ);
      let oPixIndex = (oY * width + oX) * 4;

      // Set the pixel data
      newImagedata.data[pixelindex]   = originalImageData.data[oPixIndex];     // Red
      newImagedata.data[pixelindex+1] = originalImageData.data[oPixIndex + 1]; // Green
      newImagedata.data[pixelindex+2] = originalImageData.data[oPixIndex + 2]; // Blue
      newImagedata.data[pixelindex+3] = 255;                                   // Alpha
    }
  }

  ctx.putImageData(newImagedata, 0, 0);
  var texture = new THREE.CanvasTexture(ctx.canvas);
  return new THREE.MeshStandardMaterial({color: color, map: texture, transparent: true, opacity: 1});
}

/**
 * Update the current cube face with a new material
 */
function updateFaceMaterial(){
  cube.material[Math.floor(selectedFace / 2)] = createImageFaceMaterial(colorsBackup[Math.floor(selectedFace / 2)]);
}

/**
 * Hides image options in GUI
 */
function hideImageOptions() {
  document.getElementById('lil-gui-name-9').parentNode.parentNode.parentNode.style.display = "none";
  document.getElementById('lil-gui-name-10').parentNode.parentNode.parentNode.style.display = "none";
  document.getElementById('lil-gui-name-11').parentNode.parentNode.parentNode.style.display = "none";
  document.getElementById('lil-gui-name-8').parentNode.parentNode.parentNode.style.display = "flex";
}

/**
 * Reveals image options in GUI
 */
function showImageOptions() {
  document.getElementById('lil-gui-name-9').parentNode.parentNode.parentNode.style.display = "flex";
  document.getElementById('lil-gui-name-10').parentNode.parentNode.parentNode.style.display = "flex";
  document.getElementById('lil-gui-name-11').parentNode.parentNode.parentNode.style.display = "flex";
  document.getElementById('lil-gui-name-8').parentNode.parentNode.parentNode.style.display = "none";
}

/**
 * Finish shaping the cube and move to specific face design stage
 */
function shapeDesignFinished() {
  // GUI change
 	shapeFolder.hide();
  exportFolder.show();
  // Apply transformation matrix to position attribute
  cube.geometry.attributes.position.applyMatrix4(cube.matrix);
  // Updates
  cube.geometry.attributes.position.needsUpdate = true;
  cube.geometry.computeBoundingBox();
  cube.geometry.computeBoundingSphere();
  // Reset transformation matrix scale
  cube.scale.set(1, 1, 1);
  // Cube changes
  control.detach(cube);
  for (let i = 0; i < 6; i++) {
    cube.material[i].opacity = 1;
  }

  params.stage = 2;
  document.getElementById('info').innerHTML = "Instructions: Pick a face";
}

/**
 * Change face color when hovering on it
 */
function hoverFace() {
  raycaster.setFromCamera(pointer, camera);
  // Check if mouse is intersecting the cube
  const intersects = raycaster.intersectObjects([cube]);
  if (intersects.length > 0){
    const intersection = intersects[0];
    // The intersected face
	  let faceIndex = intersection.faceIndex;
	  if (faceIndex % 2 == 1) {
	    faceIndex--;
	  }
	  currFace = faceIndex;
	  let newColor = new THREE.Color(0xffff00);
    let face = Math.floor(currFace / 2);
    for (let i = 0; i < 6; i++) {
      if (i != face) {
        cube.material[i].opacity = 0.7;
      }           
    }
    cube.material[face].color = newColor;
  }
}

/**
 * Reset colors of last intersected face
 */
function resetMaterials() {
  if (typeof currFace !== 'undefined') {
    let faceIndex = currFace;
    let face = Math.floor(currFace / 2);
    cube.material[face].color = colorsBackup[face];
    for (let i = 0; i < 6; i++) {
      cube.material[i].opacity = 1;
    }
  }
}

/**
 * Permanently paint face with color
 * 
 * @param {int}         faceIndex The index of a specific face
 * @param {THREE.Color} newColor  New color for the face
 */
function paintFace(faceIndex, newColor) {

  if (faceIndex == 'undefined') {
    return
  }

  let face = Math.floor(faceIndex / 2);
  cube.material[face].color = colorsBackup[face] = newColor;
}

/**
 * Calculate pointer position in normalized device coordinates
 * (-1 to +1) for both components
 */
function onMouseMove(event) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

/**
 * On click select face
 */
function onClick(event) {

  // Not active in stages other than 2
  if (params.stage != 2) {
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  // Check if mouse is intersecting the cube
  const intersects = raycaster.intersectObjects([cube]);
  if (intersects.length > 0) {
    const intersection = intersects[0];
    let faceIndex = intersection.faceIndex;
    if (faceIndex % 2 == 1) {
      faceIndex--;
	  }
    selectedFace = faceIndex;
    selectedFaceNormal = intersection.face.normal;

    let positions = cube.geometry.attributes.position.array;
    let indexes = cube.geometry.index.array;
    let index = indexes[faceIndex * 3];
    let pts = [];

    pts.push(new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]));
    pts.push(new THREE.Vector3(positions[(index + 1) * 3], positions[(index + 1) * 3 + 1], positions[(index + 1) * 3 + 2]));

    pts.push(new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]));
    pts.push(new THREE.Vector3(positions[(index + 2) * 3], positions[(index + 2) * 3 + 1], positions[(index + 2) * 3 + 2]));

    pts.push(new THREE.Vector3(positions[(index + 4) * 3], positions[(index + 4) * 3 + 1], positions[(index + 4) * 3 + 2]));
    pts.push(new THREE.Vector3(positions[(index + 1) * 3], positions[(index + 1) * 3 + 1], positions[(index + 1) * 3 + 2]));

    pts.push(new THREE.Vector3(positions[(index + 4) * 3], positions[(index + 4) * 3 + 1], positions[(index + 4) * 3 + 2]));
    pts.push(new THREE.Vector3(positions[(index + 2) * 3], positions[(index + 2) * 3 + 1], positions[(index + 2) * 3 + 2]));

    let lineGeometry = new THREE.BufferGeometry().setFromPoints(pts);
    let lineMaterial = new THREE.LineBasicMaterial({color: 0x00ff00});
    selectedFaceHighlight = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(selectedFaceHighlight);

    // Stage 3
	  params.stage = 3;
	  resetMaterials();
	  let face = Math.floor(selectedFace / 2);
    for (let i = 0; i < 6; i++) {
      if (i != face) {
        cube.material[i].opacity = 0.7;
      }           
    }

    params.color = cube.material[face].color.clone();
	  wrapFolder.show();
	  document.getElementById('info').innerHTML = "Instructions: Upload an image or pick a color";
  }
}

/**
 * Finish face designing of current selected face
 */
function faceDesignFinished(event) {

  if (params.stage == 3) {
    for (let i = 0; i < 6; i++) {
      cube.material[i].opacity = 1;
    }

    // In case of image upload
    if (scene.getObjectByName('pickPlane')) {
      scene.remove(pickPlane);
      scene.remove(controlShape);
      for (let j = 0; j < 4; j++) {
        scene.remove(controlPoints.pop());
      }
    }
    scene.remove(selectedFaceHighlight);
    params.stage = 2;
    wrapFolder.hide();
    document.getElementById('info').innerHTML = "Instructions: Pick a face";
    selectedFace = undefined;
    currFace = undefined;
    selectedFaceNormal = undefined;
    destPts = [];
  }

  hideImageOptions();
}

/**
 * Handle upload file to use in browser
 */
function handleFiles() {

  if (selectedFace == undefined) {
    return;
  }
  currImage = new Image();
  currImage.crossOrigin = 'Anonymous';
  const reader = new FileReader();
  reader.onloadend = () => {
    if (reader.result.startsWith('data:image')) {
      currImage.src = reader.result;
    } else {
      console.log('Error: file uploaded is not an image');
    }
  };
  reader.onerror = function (error) {
    console.log('Error: ', error);
  };
  currImage.onload = function () {
    pickCorners();
  }
  reader.readAsDataURL(this.files[0]);
}

/**
 * Pick corners
 * 
 * @params {Image} The image to be used as a face texture
 */
function pickCorners() {

  // Create plane
  const planeGeometry = createPickPlane(currImage.width, currImage.height);
  planeGeometry.computeBoundingBox();
  planeGeometry.computeBoundingSphere();
  let texture = new THREE.Texture(currImage);
  texture.needsUpdate = true;
  let planeMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: texture,
    opacity: 1
  });
  pickPlane = new THREE.Mesh(planeGeometry, planeMaterial);
  pickPlane.name = 'pickPlane';
  scene.add(pickPlane);

  // Create control points from pickPlane points
  let positions = planeGeometry.attributes.position.array;
  createControlPoint(positions[6], positions[7], positions[8], new THREE.Color('#00ff00'));
  createControlPoint(positions[9], positions[10], positions[11], new THREE.Color('#00ff00'));
  createControlPoint(positions[3], positions[4], positions[5], new THREE.Color('#00ff00'));
  createControlPoint(positions[0], positions[1], positions[2], new THREE.Color('#00ff00'));

  // Create control shape
  let lineGeometry = selectedFaceHighlight.geometry.clone();
  let lineMaterial = new THREE.LineBasicMaterial({color: 0x000000});
  controlShape = new THREE.LineSegments(lineGeometry, lineMaterial);
  scene.add(controlShape);

  // Replace face material
  calculateMatrix();
  updateFaceMaterial();

  // Show image design GUI options
  showImageOptions();
}

/**
 * Calculate perspective transform matrix from control points
 */
function calculateMatrix (event) {

  let max = pickPlane.geometry.boundingBox.max;
  let min = pickPlane.geometry.boundingBox.min;

  // Source points with normalization
  const srcPts = [];
  for (let j = 0; j < 4; j++) {
    if (selectedFaceNormal.x == 1) {
      srcPts.push((controlPoints[j].position.z - max.z) * currImage.width / (min.z - max.z));
      srcPts.push((controlPoints[j].position.y - max.y) * currImage.height / (min.y - max.y));
    } else if (selectedFaceNormal.x == -1) {
      srcPts.push((controlPoints[j].position.z - min.z) * currImage.width / (max.z - min.z));
      srcPts.push((controlPoints[j].position.y - max.y) * currImage.height / (min.y - max.y));
    }
    if (selectedFaceNormal.y == 1) {
      srcPts.push((controlPoints[j].position.z - max.z) * currImage.width / (min.z - max.z));
      srcPts.push((controlPoints[j].position.x - min.x) * currImage.height / (max.x - min.x));
    } else if (selectedFaceNormal.y == -1) {
      srcPts.push((controlPoints[j].position.z - max.z) * currImage.width / (min.z - max.z));
      srcPts.push((controlPoints[j].position.x - max.x) * currImage.height / (min.x - max.x));
    }
    if (selectedFaceNormal.z == 1) {
      srcPts.push((controlPoints[j].position.x - min.x) * currImage.width / (max.x - min.x));
      srcPts.push((controlPoints[j].position.y - max.y) * currImage.height / (min.y - max.y));
    } else if (selectedFaceNormal.z == -1) {
      srcPts.push((controlPoints[j].position.x - max.x) * currImage.width / (min.x - max.x));
      srcPts.push((controlPoints[j].position.y - max.y) * currImage.height / (min.y - max.y));
    }
  }

  // Destination points come from the face points position
  if (destPts.length == 0) {
    if (selectedFaceNormal.y == 0) {
      destPts = [0, currImage.height, currImage.width, currImage.height, currImage.width, 0, 0, 0];
    } else if (selectedFaceNormal.y == 1) {
      destPts = [currImage.width, currImage.height, currImage.width, 0, 0, 0, 0, currImage.height];
    } else if (selectedFaceNormal.y == -1) {
      destPts = [0, 0, 0, currImage.height, currImage.width, currImage.height, currImage.width, 0];
    }
  }

  const transform = PerspT(destPts, srcPts);
  coeffs = transform.coeffs;
}

/**
 * Create a control point in position (posX, posY, posZ) with color "color"
 * 
 * @params {float}       posX  Control point X position
 * @params {float}       posY  Control point Y position
 * @params {float}       posZ  Control point Z position
 * @params {THREE.Color} color Color of control point box
 */
function createControlPoint(posX, posY, posZ, color) {

  let dim = 0.1;
  let pointGeometry = new THREE.BoxGeometry(dim, dim, dim);
  let pointMaterial = new THREE.MeshBasicMaterial({
    color: color,
    transparent: true,
    opacity: 0.5
  });
  let controlPoint = new THREE.Mesh(pointGeometry, pointMaterial);
  controlPoint.position.set(posX, posY, posZ);
  controlPoints.push(controlPoint);
  scene.add(controlPoint);
}

/**
 * Creates 4 lines from 4 points and return a buffer geometry
 *   p4--p3
 *   |   |
 *   p1--p2
 * 
 * @params {THREE.Vector3} p1
 * @params {THREE.Vector3} p2
 * @params {THREE.Vector3} p3
 * @params {THREE.Vector3} p4
 * 
 * @return {THREE.BufferGeometry}
 */
function lineGeometryFromPoints(p1, p2, p3, p4) {

  let pts = [];
  pts.push(p4);
  pts.push(p3);
  pts.push(p4);
  pts.push(p1);
  pts.push(p2);
  pts.push(p3);
  pts.push(p2);
  pts.push(p1);
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/**
 * Creates a plane geometry from 4 points
 *   p1--p2
 *    |  |
 *   p3--p4
 * 
 * @params {THREE.Vector3} p1
 * @params {THREE.Vector3} p2
 * @params {THREE.Vector3} p3
 * @params {THREE.Vector3} p4
 * 
 * @return {THREE.BufferGeometry}
 */
function planeGeometryFromPoints(p1, p2, p3, p4) {

  let geometry = new THREE.BufferGeometry();
  let vertices = new Float32Array([
    p1.x, p1.y, p1.z,
    p2.x, p2.y, p2.z,
    p3.x, p3.y, p3.z,
    p4.x, p4.y, p4.z
  ]);
  let uvs = new Float32Array([
    0.0, 1.0,
    1.0, 1.0,
    0.0, 0.0,
    1.0, 0.0
  ]);
  let indices = new Uint32Array([
    0, 2, 1, 2, 3, 1
  ]);
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return geometry;
}

/**
 * Create a plane on which the image will be shown with control points
 * 
 * @params {float} imageWidth  Width of the image that will be a texture on the plane
 * @params {float} imageHeight Height of the image that will be a texture on the plane
 * 
 * @return {THREE.BufferGeometry} The pick plane
 */
function createPickPlane(imageWidth, imageHeight) {

  let width, height;
  selectedFaceHighlight.geometry.computeBoundingBox();
  let max = selectedFaceHighlight.geometry.boundingBox.max;
  let min = selectedFaceHighlight.geometry.boundingBox.min;

  // Calculate plane width and height
  let faceWidth, faceHeight;
  if (selectedFaceNormal.x != 0) {
    faceWidth = max.z - min.z;
    faceHeight = max.y - min.y;
  } else if (selectedFaceNormal.y != 0) {
    faceWidth = max.z - min.z;
    faceHeight = max.x - min.x;
  } else if (selectedFaceNormal.z != 0) {
    faceWidth = max.x - min.x;
    faceHeight = max.y - min.y;
  }
  let faceRatio = faceWidth / faceHeight;
  let imageRatio = imageWidth / imageHeight;
  if (faceRatio > imageRatio) {
    width = faceWidth;
    height = width * imageHeight / imageWidth;
  } else {
    height = faceHeight;
    width = height * imageWidth / imageHeight;
  }

  // Calculate points
  let p1, p2, p3, p4;
  if (selectedFaceNormal.x != 0) {
    p1 = new THREE.Vector3(max.x,  height / 2, -selectedFaceNormal.x * (faceWidth / 2 + 0.1));
    p2 = new THREE.Vector3(max.x,  height / 2, -selectedFaceNormal.x * (faceWidth / 2 + 0.1 + width));
    p3 = new THREE.Vector3(max.x, -height / 2, -selectedFaceNormal.x * (faceWidth / 2 + 0.1));
    p4 = new THREE.Vector3(max.x, -height / 2, -selectedFaceNormal.x * (faceWidth / 2 + 0.1 + width));
  } else if (selectedFaceNormal.y != 0) {
    p1 = new THREE.Vector3(-selectedFaceNormal.y * ( height / 2), max.y, -(faceWidth / 2 + 0.1));
    p2 = new THREE.Vector3(-selectedFaceNormal.y * ( height / 2), max.y, -(faceWidth / 2 + 0.1 + width));
    p3 = new THREE.Vector3(-selectedFaceNormal.y * (-height / 2), max.y, -(faceWidth / 2 + 0.1));
    p4 = new THREE.Vector3(-selectedFaceNormal.y * (-height / 2), max.y, -(faceWidth / 2 + 0.1 + width));
  }else if (selectedFaceNormal.z != 0) {
    p1 = new THREE.Vector3(selectedFaceNormal.z * (faceWidth / 2 + 0.1)        ,  height / 2, max.z);
    p2 = new THREE.Vector3(selectedFaceNormal.z * (faceWidth / 2 + 0.1 + width),  height / 2, max.z);
    p3 = new THREE.Vector3(selectedFaceNormal.z * (faceWidth / 2 + 0.1)        , -height / 2, max.z);
    p4 = new THREE.Vector3(selectedFaceNormal.z * (faceWidth / 2 + 0.1 + width), -height / 2, max.z);
  }

  return planeGeometryFromPoints(p1, p2, p3, p4);
}

/**
 * Create the GUI
 */
function createGUI() {

  gui = new GUI();

  // Fixed section
  let sceneFolder = gui.addFolder('Scene Controls');
  sceneFolder.add(params, 'fov', 10, 150).name('FOV').step(1).onChange(function (fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix(); 
  });
  sceneFolder.add(params, 'axes').name ('Show axes').onChange(function () {
    if (params.axes) {
      scene.add(axes);    
    } else {
      scene.remove(axes);
    }
  });
  sceneFolder.add(params, 'grid').name('Show grid').onChange(function () {
    if (params.grid) {
      scene.add(gridHelper);
    } else {
      scene.remove(gridHelper);
    }
  });
  sceneFolder.add( params, 'spin' ).name( 'Spin' ).onChange( function () {
    if (params.spin) {
      orbit.autoRotate = true;
    } else {
      orbit.autoRotate = false;
    }
  });
  sceneFolder.add(params, 'bgcolor', {Black: 'black', White: 'white', Blue: 'deepskyblue'}).name('Background Color').onChange(function () {
    scene.background = new THREE.Color(params.bgcolor);
  });
  sceneFolder.open();

  // 1st stage section
  shapeFolder = gui.addFolder('Shape Transform Controls');
  shapeFolder.add(params, 'next').name('Next');
  shapeFolder.open();

  // 3rd stage section
  wrapFolder = gui.addFolder('Face Design Controls');
  wrapFolder.addColor(params, 'color').name('Pick color').listen().onChange(function (colorValue) {
    paintFace(currFace, new THREE.Color(colorValue));
  });
  wrapFolder.add(params, 'upload').name('Upload image');
  wrapFolder.add(params, 'rotate').name('Rotate image');
  wrapFolder.add(params, 'vFlip').name('Flip image vertically');
  wrapFolder.add(params, 'hFlip').name('Flip image horizontally');
  wrapFolder.add(params, 'finish').name('Finished');
  wrapFolder.hide();

  // Export section
  exportFolder = gui.addFolder('Export');
  exportFolder.add(params, 'trs').name('Use TRS');
  exportFolder.add(params, 'binary').name('Binary (GLB)');
  exportFolder.add(params, 'exportCube').name('Export Cube');
  exportFolder.hide();
}

/**
 * Export as gtlf or glb file
 * 
 * @params {THREE.Object3D} input The cube object
 */
function exportGLTF(input) {

  const gltfExporter = new GLTFExporter();

  const options = {
    trs: params.trs,
    binary: params.binary
  };
  gltfExporter.parse(
    input,
    function (result) {
      if (result instanceof ArrayBuffer) {
        saveArrayBuffer(result, 'cubyot.glb');
      } else {
        const output = JSON.stringify(result, null, 2);
        console.log(output);
        saveString(output, 'cubyot.gltf');
      }
    },
    function (error) {
      //console.log( 'An error happened during parsing', error );
      alert('An error happened during parsing', error);
    },
    options
  );
}

const link = document.createElement('a');
link.style.display = 'none';
document.body.appendChild(link); // Firefox workaround, see #6594

function save(blob, filename) {
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function saveString(text, filename) {
  save(new Blob([text], {type: 'text/plain'}), filename);
}

function saveArrayBuffer(buffer, filename) {
  save(new Blob([buffer], {type: 'application/octet-stream'}), filename);
}