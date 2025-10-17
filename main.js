import * as THREE from "three";
import gsap from "gsap";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

let camera, scene, renderer, loader, fbxLoader, controls, torus, circle;
let audio, context, analyser, dataArray, bufferLength, src;
let audioToggle = false;
let lastEnergy = 0;
let raycaster, mouse;
let composer, bloomPass;
let activeModel = null;
let mixers = [];
let trailMeshes = [];
let particleSystem = null;
let particleGeometry = null;
let particleMaterial = null;
let baseRotationY = -Math.PI; // -180°
let rotationRange = Math.PI / 3; // 60°
let currentIndexColor = 0;
let score = 0;
let combo = 0;
let maxCombo = 0;
let motionIntensity = 0;
let particleIndex = 0;
let isPlaying = false;
let diffGame = "";
let beatCooldown = 0;
let diffBeat = 0;
let previousPosition = new THREE.Vector3();
let previousRotation = new THREE.Euler();
const animationActions = [];
const cubes = [];
const BLOOM_SCENE = 1;
const saberColors = [0xff66b3, 0x30c3ff];
const MAX_PARTICLES = 1000;
const MODEL_DISTANCE = 35;
const clock = new THREE.Clock();
const cursorTarget = new THREE.Vector3();
const cursorPlane = new THREE.Plane();
const _tmpDir = new THREE.Vector3();
const _tmpPoint = new THREE.Vector3();
const infoScoreEl = document.getElementById("infoScore");
const infoComboEl = document.getElementById("infoCombo");
const btnBackEl2 = document.getElementById("btnBack");
const containerEl = document.querySelector(".container");
const menuStartEl = document.querySelector(".menu_start");
const menuDiffEl = document.querySelector(".menu_diff");
const btnStartEl = document.querySelector(".btn_start");
const btnDiffEl = document.querySelectorAll(".btn_diff");
const btnBackEl = document.querySelectorAll(".btn_back");
const btnPlayEl = document.querySelector(".btn_play");
const gameSectionEl = document.querySelector(".gameSection");
const menuPlayEl = document.querySelector(".menu_play");
const scoreBoardEl = document.querySelector(".score_board");
const finalScoreBoardEl = document.getElementById("finalScore");
const maxComboBoardEl = document.getElementById("maxCombo");
const btnRestartEl = document.querySelector(".btn_restart");
const btnHomeEl = document.querySelector(".btn_home");
const overlayEl = document.getElementById("overlay");

const colorMap = new Map([
  [0xff0080, 0xff66b3],
  [0x00c0ff, 0x30c3ff],
]);

const environmentMap = [
  "environment/img2/px.png",
  "environment/img2/nx.png",
  "environment/img2/py.png",
  "environment/img2/ny.png",
  "environment/img2/pz.png",
  "environment/img2/nz.png",
];

init();

function updateStats() {
  if (infoScoreEl) {
    infoScoreEl.innerText = score.toFixed(0);
  }

  if (infoComboEl) {
    let comboText = `Combo: ${combo}`;

    if (combo >= 20) {
      comboText = `LEGENDARY! ${combo}`;
    } else if (combo >= 15) {
      comboText = `INSANE! ${combo}`;
    } else if (combo >= 10) {
      comboText = `AMAZING! ${combo}`;
    } else if (combo >= 5) {
      comboText = `GREAT! ${combo}`;
    } else if (combo >= 3) {
      comboText = `NICE! ${combo}`;
    }

    if (combo > maxCombo) {
      maxCombo = combo;
    }

    infoComboEl.innerText = comboText;
  }
}

function resetCombo(reason = "miss") {
  console.log(`Combo reset due to ${reason}. Final combo: ${combo}`);
  if (combo > 0) {
    gsap
      .timeline()
      .to(infoComboEl, {
        scale: 1.3,
        color: "#ff0000",
        duration: 0.1,
        ease: "power2.out",
      })
      .to(infoComboEl, {
        scale: 0.8,
        duration: 0.15,
        ease: "bounce.out",
      })
      .to(infoComboEl, {
        scale: 1,
        color: "#ffffff",
        duration: 0.2,
        ease: "bounce.out",
        onComplete: () => {
          combo = 0;
          updateStats();
        },
      });
  } else {
    combo = 0;
  }
}

function setupPostProcessing() {
  try {
    composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.setSize(window.innerWidth, window.innerHeight);

    composer.addPass(renderPass);
    bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.0, // strength
      0.4, // radius
      0.5 // threshold
    );
    renderer.toneMappingExposure = 2.0;
    composer.addPass(bloomPass);
    console.log("Post-processing setup successfully");
  } catch (error) {
    console.warn(
      "Post-processing setup failed, using fallback rendering:",
      error
    );
    composer = null;
    bloomPass = null;
  }
}

function makeGlowShell(cube, color) {
  const shellMat = new THREE.MeshBasicMaterial({
    color,
    blending: THREE.AdditiveBlending,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
  const shell = new THREE.Mesh(cube.geometry.clone(), shellMat);
  shell.scale.set(1.07, 1.07, 1.07);
  shell.name = "glowShell";
  shell.layers.enable(BLOOM_SCENE);
  shell.userData.isGlowShell = true;
  cube.add(shell);
}

function spawnCube() {
  const cubeGeometry = new THREE.BoxGeometry(4, 4, 4);

  const neonColors = [
    0xff0080, // Hot Pink
    0x00c0ff, // Sky Blue
  ];

  const randomNeonColor =
    neonColors[Math.floor(Math.random() * neonColors.length)];

  const material = new THREE.MeshStandardMaterial({
    roughness: 0.2,
    metalness: 0.0,
    emissive: new THREE.Color(randomNeonColor),
    emissiveIntensity: 0.5,
    color: randomNeonColor,
  });

  const cube = new THREE.Mesh(cubeGeometry, material);
  cube.position.set(
    (Math.random() - 0.5) * 30,
    (Math.random() - 0.5) * 30,
    -20
  );

  cube.userData = {
    color: randomNeonColor,
    hasBeenSliced: false,
  };

  cube.castShadow = true;
  cube.receiveShadow = true;
  scene.add(cube);
  cubes.push(cube);

  makeGlowShell(cube, randomNeonColor);

  cube.rotation.set(
    Math.random() * Math.PI,
    Math.random() * Math.PI,
    Math.random() * Math.PI
  );

  gsap.to(cube.position, {
    z: 100,
    duration: 4,
    ease: "power1.inOut",
    onUpdate: () => {
      if (cube.position.z > 70 && !cube.userData.hasBeenSliced) {
        resetCombo("miss");
      }
    },
    onComplete: () => {
      scene.remove(cube);
      const index = cubes.indexOf(cube);
      if (index > -1) {
        cubes.splice(index, 1);
      }
      cube.geometry?.dispose?.();
      if (cube.material?.dispose) cube.material.dispose();
    },
  });

  gsap.to(cube.rotation, {
    x: cube.rotation.x + Math.PI * 1,
    y: cube.rotation.y + Math.PI * 1,
    z: cube.rotation.z + Math.PI * 1,
    duration: 8,
    ease: "power1.inOut",
  });
}

function createTorus(color, texture = null, radius = 1, tubeRadius = 10) {
  const geometry = new THREE.TorusGeometry(radius, tubeRadius, 40, 100);
  let material;

  if (texture) {
    const tex = new THREE.TextureLoader().load(texture);
    material = new THREE.MeshPhysicalMaterial({
      map: tex,
      metalness: 1.0,
      roughness: 0.2,
      envMapIntensity: 1.0,
      clearcoat: 1.0,
      clearcoatRoughness: 0.1,
    });
  } else {
    material = new THREE.MeshPhysicalMaterial({
      color: color,
      metalness: 1.0,
      roughness: 0.2,
    });
  }

  const sphere = new THREE.Mesh(geometry, material);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  return sphere;
}

function createCircle(size = 1, color = 0xffffff) {
  const segments = 64;
  const geometry = new THREE.CircleGeometry(size, segments);
  const material = new THREE.MeshBasicMaterial({ color: color });
  const circle = new THREE.Mesh(geometry, material);
  circle.rotation.x = -Math.PI / 2;
  return circle;
}

function createDirectionalLight(color, intensity = 2) {
  const light = new THREE.DirectionalLight(color, intensity);

  light.position.set(0, 10, -200);
  light.target.position.set(0, 0, 100);

  light.castShadow = true;
  light.shadow.bias = -0.001;

  light.shadow.camera.left = -500;
  light.shadow.camera.right = 500;
  light.shadow.camera.top = 500;
  light.shadow.camera.bottom = -500;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 1000;

  light.shadow.mapSize.width = 2048;
  light.shadow.mapSize.height = 2048;

  scene.add(light);
  scene.add(light.target);

  // const helper = new THREE.CameraHelper(light.shadow.camera);
  // scene.add(helper);
}

function showScoreBoard() {
  gameSectionEl.classList.add("hidden");
  if (scoreBoardEl) scoreBoardEl.classList.remove("hidden");
  if (finalScoreBoardEl) finalScoreBoardEl.innerText = score.toFixed(0);
  if (maxComboBoardEl) maxComboBoardEl.innerText = `Max Combo: ${maxCombo}`;
}

function detectBeat() {
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
  const average = sum / bufferLength;
  if (average - lastEnergy > 30 || (average > 100 && beatCooldown <= 0)) {
    spawnCube();
    beatCooldown = diffBeat || 50;
  }
  lastEnergy = average;
  if (beatCooldown > 0) beatCooldown--;
}

function setupAudioForDiff() {
  try {
    if (audio) audio.pause();
  } catch {}
  if (!context) {
    context = new (window.AudioContext || window.webkitAudioContext)();
  }

  try {
    src?.disconnect();
  } catch {}
  try {
    analyser?.disconnect();
  } catch {}

  const file = diffGame === "easy" ? "/music/song2.mp3" : "/music/song1.mp3";
  diffBeat = diffGame === "easy" ? 60 : 30;

  audio = new Audio(file);
  audio.crossOrigin = "anonymous";

  audio.addEventListener("ended", () => {
    audioToggle = false;
    isPlaying = false;
    clearCubes();
    showScoreBoard();
    setOrbitEnabled(true);
  });

  src = context.createMediaElementSource(audio);
  analyser = context.createAnalyser();
  src.connect(analyser);
  analyser.connect(context.destination);

  analyser.fftSize = 256;
  bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);

  audioToggle = false;
}

function pauseAudioForce() {
  try {
    if (audioToggle) {
      audio.pause();
      audio.currentTime = 0;
    }

    if (context && context.state !== "suspended") {
      context.suspend();
    }
  } catch {}
  audioToggle = false;
}

function clearCubes() {
  cubes.forEach((cube) => {
    gsap.killTweensOf(cube.position);
    gsap.killTweensOf(cube.rotation);
    scene.remove(cube);
    cube.geometry?.dispose?.();
    if (cube.material?.dispose) cube.material.dispose();
  });
  cubes.length = 0;
}

function stopGame() {
  pauseAudioForce();
  clearCubes();
}

function resetCamera(
  pos = new THREE.Vector3(0, 0, 100),
  target = new THREE.Vector3(0, 0, 0)
) {
  camera.position.copy(pos);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(target);
    controls.update();
  }
}

function setOrbitEnabled(enabled) {
  if (!controls) return;
  controls.enabled = enabled;
  controls.enableRotate = enabled;
  controls.enablePan = enabled;
  controls.enableZoom = enabled;
}

function playSkyboxIntro(duration = 3) {
  const target = controls?.target
    ? controls.target.clone()
    : new THREE.Vector3(0, 0, 0);
  const radius = camera.position.distanceTo(target) || 100;

  camera.position.set(0, -radius, 0);
  camera.lookAt(target);
  controls?.update();

  gsap.to(camera.position, {
    x: 0,
    y: 0,
    z: radius,
    duration,
    ease: "power2.inOut",
    onUpdate: () => {
      camera.lookAt(target);
      controls?.update();
    },
    onComplete: () => {
      camera.lookAt(target);
      controls?.update();
      spawnCube();
    },
  });
}

function init() {
  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    1000
  );
  camera.position.set(0, 0, 100);
  camera.layers.enable(BLOOM_SCENE);

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0x111122, 3));

  torus = createTorus(0x222244, "/texture/metal.jpg", 100);
  torus.position.set(0, -200, 0);
  torus.rotation.x = -Math.PI / 2;
  scene.add(torus);

  circle = createCircle(75, 0xffc0e0);
  circle.position.set(0, -200, 0);
  scene.add(circle);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setAnimationLoop(animate);
  document.body.appendChild(renderer.domElement);

  setupPostProcessing();

  loader = new THREE.CubeTextureLoader();
  const cubeMap = loader.load(environmentMap);
  cubeMap.encoding = THREE.sRGBEncoding;
  scene.background = cubeMap;
  scene.environment = cubeMap;

  fbxLoader = new GLTFLoader();
  loadModel();

  if (!isPlaying) {
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.update();
    if (controls.saveState) controls.saveState();
  } else {
    camera.lookAt(0, 0, 0);
  }

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("mousemove", onMouseMove);

  document.addEventListener("keydown", (event) => {
    if (event.code === "KeyA") {
      currentIndexColor = 0;
      updateNeonColor();
    }
    if (event.code === "KeyD") {
      currentIndexColor = 1;
      updateNeonColor();
    }
  });

  playSkyboxIntro(3);
  createDirectionalLight(0xffffff, 1);
}

function loadModel() {
  fbxLoader.load(
    "model/Lightsaber.glb",
    (gltf) => {
      console.log("Model loaded successfully:", gltf);
      const model = gltf.scene;
      model.position.set(0, -10, 65);
      model.scale.set(1, 1, 1);
      model.rotation.y = -Math.PI * 1;
      model.rotation.x = 64.2 * (Math.PI / 180);
      model.rotation.z = -Math.PI * 0.5;

      model.traverse((child) => {
        if (child.isMesh) {
          const mat = child.material;
          mat.metalness = 0.1;
          mat.roughness = 0.3;
          mat.envMapIntensity = 1.0;
          mat.needsUpdate = true;
        }
      });

      scene.add(model);
      activeModel = model;

      const lookDir = new THREE.Vector3();
      camera.getWorldDirection(lookDir);
      model.position
        .copy(camera.position)
        .addScaledVector(lookDir, MODEL_DISTANCE);

      cursorTarget.copy(model.position);
      updateCursorPlane();
      updateNeonColor();
      initParticleSystem();
    },
    (progress) => {
      console.log(
        "Loading progress:",
        (progress.loaded / progress.total) * 100 + "%"
      );
    },
    (error) => {
      console.error("Error loading model:", error);
    }
  );
}

function initParticleSystem() {
  particleGeometry = new THREE.BufferGeometry();

  const positions = new Float32Array(MAX_PARTICLES * 3);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const ages = new Float32Array(MAX_PARTICLES);
  const sizes = new Float32Array(MAX_PARTICLES);
  const colors = new Float32Array(MAX_PARTICLES * 3);

  particleGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );
  particleGeometry.setAttribute(
    "velocity",
    new THREE.BufferAttribute(velocities, 3)
  );
  particleGeometry.setAttribute("age", new THREE.BufferAttribute(ages, 1));
  particleGeometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  particleGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  particleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      saberColor: { value: new THREE.Color(saberColors[currentIndexColor]) },
      maxAge: { value: 1.0 },
    },
    vertexShader: `
      attribute float age;
      attribute float size;
      attribute vec3 color;
      
      uniform float time;
      uniform float maxAge;
      
      varying float vAge;
      varying vec3 vColor;
      varying float vOpacity;
      
      void main() {
        vAge = age;
        vColor = color;
        vOpacity = 1.0 - (age / maxAge);
        
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = size * (300.0 / -mvPosition.z) * vOpacity;
      }
    `,
    fragmentShader: `
      uniform vec3 saberColor;
      
      varying float vAge;
      varying vec3 vColor;
      varying float vOpacity;
      
      void main() {
        float distance = length(gl_PointCoord - vec2(0.5));
        if (distance > 0.5) discard;
        
        float alpha = (1.0 - distance * 2.0) * vOpacity;
        gl_FragColor = vec4(saberColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });

  particleSystem = new THREE.Points(particleGeometry, particleMaterial);
  particleSystem.layers.enable(BLOOM_SCENE);
  scene.add(particleSystem);
}

function emitParticles(position, velocity, intensity) {
  if (!particleSystem || intensity < 0.1) return;

  const positionArray = particleGeometry.attributes.position.array;
  const velocityArray = particleGeometry.attributes.velocity.array;
  const ageArray = particleGeometry.attributes.age.array;
  const sizeArray = particleGeometry.attributes.size.array;
  const colorArray = particleGeometry.attributes.color.array;

  const particlesToEmit = Math.floor(intensity * 10) + 1;

  for (let i = 0; i < particlesToEmit; i++) {
    const index = particleIndex % MAX_PARTICLES;
    const index3 = index * 3;

    positionArray[index3] = position.x + (Math.random() - 0.5) * 5;
    positionArray[index3 + 1] = position.y + 15 + (Math.random() - 0.5) * 15;
    positionArray[index3 + 2] = position.z + (Math.random() - 0.5) * 5;

    velocityArray[index3] = velocity.x * 0.3 + (Math.random() - 0.5) * 5;
    velocityArray[index3 + 1] = velocity.y * 0.3 + (Math.random() - 0.5) * 5;
    velocityArray[index3 + 2] = velocity.z * 0.3 + (Math.random() - 0.5) * 5;

    ageArray[index] = 0;
    sizeArray[index] = (0.5 + intensity * 1.5) * (Math.random() * 0.5 + 0.5);

    const color = new THREE.Color(saberColors[currentIndexColor]);
    colorArray[index3] = color.r;
    colorArray[index3 + 1] = color.g;
    colorArray[index3 + 2] = color.b;

    particleIndex++;
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.velocity.needsUpdate = true;
  particleGeometry.attributes.age.needsUpdate = true;
  particleGeometry.attributes.size.needsUpdate = true;
  particleGeometry.attributes.color.needsUpdate = true;
}

function updateParticleSystem(deltaTime) {
  if (!particleSystem) return;

  const positionArray = particleGeometry.attributes.position.array;
  const velocityArray = particleGeometry.attributes.velocity.array;
  const ageArray = particleGeometry.attributes.age.array;

  for (let i = 0; i < MAX_PARTICLES; i++) {
    const index3 = i * 3;

    if (ageArray[i] < 1.0) {
      positionArray[index3] += velocityArray[index3] * deltaTime;
      positionArray[index3 + 1] += velocityArray[index3 + 1] * deltaTime;
      positionArray[index3 + 2] += velocityArray[index3 + 2] * deltaTime;

      velocityArray[index3] *= 0.98;
      velocityArray[index3 + 1] *= 0.98;
      velocityArray[index3 + 2] *= 0.98;
      velocityArray[index3 + 1] -= 9.8 * deltaTime * 0.1; // gravity

      ageArray[i] += deltaTime;
    }
  }

  particleMaterial.uniforms.time.value += deltaTime;
  particleMaterial.uniforms.saberColor.value.setHex(
    saberColors[currentIndexColor]
  );

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.velocity.needsUpdate = true;
  particleGeometry.attributes.age.needsUpdate = true;
}

function createMotionTrail() {
  if (!activeModel) return;

  const currentPos = activeModel.position.clone();
  const currentRot = activeModel.rotation.clone();

  const positionDelta = currentPos.distanceTo(previousPosition);
  const rotationDelta =
    Math.abs(currentRot.y - previousRotation.y) +
    Math.abs(currentRot.x - previousRotation.x) +
    Math.abs(currentRot.z - previousRotation.z);

  motionIntensity = Math.min(1.0, positionDelta * 5 + rotationDelta * 2);

  if (motionIntensity > 0.05) {
    const velocity = currentPos
      .clone()
      .sub(previousPosition)
      .multiplyScalar(60);
    emitParticles(currentPos, velocity, motionIntensity);
  }

  previousPosition.copy(currentPos);
  previousRotation.copy(currentRot);
}

function createVanishEffect(object) {
  const mat = object.material;
  if (!mat) return;

  if (typeof mat.emissiveIntensity === "number") {
    const t = { v: mat.emissiveIntensity };
    gsap.to(t, {
      v: 2,
      duration: 0.5,
      delay: 0.3,
      repeat: 1,
      onStart: () => {
        if (mat.emissive) mat.emissive = new THREE.Color(0xffffff);
      },
      onUpdate: () => (mat.emissiveIntensity = t.v),
    });
  }

  gsap.to(object.scale, {
    x: 0,
    y: 0,
    z: 0,
    duration: 0.5,
    ease: "back.in(2)",
  });

  gsap.to(object.rotation, {
    x: `+=${Math.PI * 4}`,
    y: `+=${Math.PI * 4}`,
    z: `+=${Math.PI * 4}`,
    duration: 0.5,
    ease: "power2.inOut",
  });

  if (typeof mat.opacity === "number") {
    const t2 = { v: 1 };
    gsap.to(t2, {
      v: 0,
      duration: 0.5,
      ease: "power2.in",
      onStart: () => (mat.transparent = true),
      onUpdate: () => (mat.opacity = t2.v),
    });
  }
}

function sliceCube(cube) {
  const left = cube.clone();
  const right = cube.clone();

  const index = cubes.indexOf(cube);
  if (index > -1) cubes.splice(index, 1);

  left.scale.set(1, 0.5, 1);
  right.scale.set(1, 0.5, 1);
  left.position.x += 1;
  right.position.x -= 1;
  left.position.y += 0.25;
  right.position.y -= 0.25;

  scene.remove(cube);
  scene.add(left, right);

  cube.geometry?.dispose?.();
  if (cube.material?.dispose) cube.material.dispose();

  gsap.to(left.rotation, {
    x: Math.PI / 4,
    duration: 0.5,
  });

  gsap.to(right.rotation, {
    x: -Math.PI / 4,
    duration: 0.5,
  });

  gsap.delayedCall(0.5, () => {
    createVanishEffect(left);
    createVanishEffect(right);

    gsap.delayedCall(2.5, () => {
      scene.remove(left);
      scene.remove(right);

      left.geometry?.dispose?.();
      right.geometry?.dispose?.();
      if (left.material?.dispose) left.material.dispose();
      if (right.material?.dispose) right.material.dispose();
    });
  });
}

function applyNeonToLightsaber(root, opts = {}) {
  const {
    color = 0x00e5ff,
    intensity = 3.0,
    cutoff = 1,
    softness = 0.08,
  } = opts;

  const meshes = [];
  root.traverse((c) => {
    if (c.isMesh && c.material) meshes.push(c);
  });
  if (meshes.length === 0) return;

  let pick = null;
  for (const m of meshes) {
    if (!m.geometry) continue;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    if (!bb) continue;
    const size = new THREE.Vector3();
    bb.getSize(size);
    const dims = [size.x, size.y, size.z];
    const maxLen = Math.max(...dims);
    const mid = dims.sort((a, b) => b - a)[1] || 1;
    const ratio = maxLen / mid;
    if (!pick || ratio > pick.ratio) pick = { mesh: m, bb, size, ratio };
  }
  if (!pick) return;

  const mesh = pick.mesh;
  const bb = pick.bb;
  const size = pick.size;

  let axis = new THREE.Vector3(1, 0, 0);
  let axisIndex = 0;
  if (size.y >= size.x && size.y >= size.z) {
    axis.set(0, 1, 0);
    axisIndex = 1;
  } else if (size.z >= size.x && size.z >= size.y) {
    axis.set(0, 0, 1);
    axisIndex = 2;
  }

  const range =
    axisIndex === 0
      ? bb.max.x - bb.min.x
      : axisIndex === 1
      ? bb.max.y - bb.min.y
      : bb.max.z - bb.min.z;
  const maxCoord =
    axisIndex === 0 ? bb.max.x : axisIndex === 1 ? bb.max.y : bb.max.z;

  const bladeMin = maxCoord - cutoff * range;
  const bladeMax = bladeMin + Math.max(0.0001, softness * range);

  const neon = new THREE.Color(color);
  let mat = mesh.material;
  if (mesh.userData._originalMaterial) {
    mesh.material = mesh.userData._originalMaterial.clone();
    mat = mesh.material;
  } else {
    mesh.userData._originalMaterial = mat.clone();
  }

  mat.needsUpdate = true;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.neonColor = { value: neon };
    shader.uniforms.neonIntensity = { value: intensity };
    shader.uniforms.bladeAxis = { value: axis.clone().normalize() };
    shader.uniforms.bladeMin = { value: bladeMin };
    shader.uniforms.bladeMax = { value: bladeMax };

    shader.vertexShader =
      "varying vec3 vPos;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n  vPos = transformed;"
      );

    shader.fragmentShader =
      "varying vec3 vPos;\n" +
      "uniform vec3 neonColor;\n" +
      "uniform float neonIntensity;\n" +
      "uniform vec3 bladeAxis;\n" +
      "uniform float bladeMin;\n" +
      "uniform float bladeMax;\n" +
      shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `
      #include <emissivemap_fragment>
      float coord = dot(vPos, normalize(bladeAxis));
      float mask = smoothstep(bladeMin, bladeMax, coord);
      totalEmissiveRadiance += neonColor * neonIntensity * mask;
        `
      );

    mesh.userData._shader = shader;
  };

  if (mat.emissive) {
    mat.emissive.setHex(0x000000);
    if (typeof mat.emissiveIntensity === "number") mat.emissiveIntensity = 0.0;
  }

  mesh.layers.enable(BLOOM_SCENE);
  mat.toneMapped = false;
}

function setCubeHighlight(cube, active) {
  if (!cube) return;
  const mat = cube.material;
  const shell = cube.getObjectByName("glowShell");

  if (mat && typeof mat.emissiveIntensity === "number") {
    const targetIntensity = active ? 2.0 : 0.5;
    const t = { v: mat.emissiveIntensity };
    gsap.to(t, {
      v: targetIntensity,
      duration: 0.2,
      onUpdate: () => (mat.emissiveIntensity = t.v),
    });
  }

  if (shell && shell.material && typeof shell.material.opacity === "number") {
    const targetOpacity = active ? 0.9 : 0.6;
    const t2 = { v: shell.material.opacity };
    gsap.to(t2, {
      v: targetOpacity,
      duration: 0.2,
      onUpdate: () => (shell.material.opacity = t2.v),
    });
  }
}

function checkMatchColor(cube) {
  if (!cube?.userData?.color) return false;
  const col = cube.userData.color;
  return colorMap.get(col) === saberColors[currentIndexColor];
}

function checkModelIntersection() {
  if (!activeModel) return;

  const modelRaycaster = new THREE.Raycaster();
  const direction = new THREE.Vector3(0, 0, 1);
  direction.applyQuaternion(activeModel.quaternion);
  modelRaycaster.set(activeModel.position, direction);
  const hits = modelRaycaster.intersectObjects(cubes, true);

  if (hits.length > 0) {
    let cube = hits[0].object;
    while (cube && !cubes.includes(cube)) cube = cube.parent;

    if (cube && !cube.userData.hasBeenSliced) {
      if (checkMatchColor(cube)) {
        cube.userData.hasBeenSliced = true;
        combo++;
        score = score + 1 * combo;
        sliceCube(cube);
        setCubeHighlight(cube, true);
        updateStats();
      } else {
        resetCombo("wrong color");
        updateStats();
      }
    }
  }
}

function updateCursorPlane() {
  if (!activeModel) return;
  const n = _tmpDir.copy(camera.getWorldDirection(_tmpDir));
  const p = _tmpPoint.copy(camera.position).addScaledVector(n, MODEL_DISTANCE);
  cursorPlane.setFromNormalAndCoplanarPoint(n, p);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onMouseMove(event) {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  if (activeModel) {
    updateCursorPlane();
    if (raycaster.ray.intersectPlane(cursorPlane, _tmpPoint)) {
      cursorTarget.copy(_tmpPoint);
      cursorTarget.y -= 15;
    }
    const dynamicRotationY = baseRotationY - mouse.x * rotationRange;
    gsap.to(activeModel.rotation, {
      y: dynamicRotationY,
      duration: 0.3,
      ease: "power2.out",
    });
  }
}

function animate() {
  const time = performance.now() * 0.001;
  const delta = clock.getDelta();

  mixers.forEach((mixer) => {
    mixer.update(delta);
  });

  updateStats();

  if (activeModel) {
    activeModel.position.lerp(cursorTarget, 0.15);
    createMotionTrail();
    updateParticleSystem(delta);
    checkModelIntersection();
  }

  if (audioToggle && audio && !audio.paused) {
    detectBeat();
  }

  if (composer && bloomPass) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

function updateNeonColor() {
  if (activeModel) {
    applyNeonToLightsaber(activeModel, {
      color: saberColors[currentIndexColor],
      intensity: 3.0,
      cutoff: 0.8,
      softness: 0.06,
    });

    trailMeshes.forEach((mesh) => {
      if (mesh.material) {
        mesh.material.color.setHex(saberColors[currentIndexColor]);
      }
    });
  }
}

function toggleAudio() {
  if (!audio || !context || !analyser) {
    setupAudioForDiff();
  }

  if (audioToggle) {
    audio.pause();
    context.suspend();
    audioToggle = false;
    console.log("Audio paused");
  } else {
    context.resume().then(() => {
      audio.play();
      audioToggle = true;
      console.log("Audio playing");
    });
  }
}

document.querySelector("#playButton").addEventListener("click", () => {
  context.resume().then(() => {
    toggleAudio();
    animate();
  });
});

function showOverlay() {
  if (overlayEl) {
    overlayEl.classList.remove("hidden");
  }
}

function hideOverlay() {
  if (overlayEl) {
    overlayEl.classList.add("hidden");
  }
}

// menu game
function startGame() {
  isPlaying = true;
  setOrbitEnabled(false);
  resetCamera(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, 0));
  hideOverlay();

  gameSectionEl.classList.remove("hidden");
  menuPlayEl.classList.add("hidden");
  menuDiffEl.classList.add("hidden");
  containerEl.classList.add("hidden");
  score = 0;
  combo = 0;
  updateStats();
}

function resetGame() {
  score = 0;
  combo = 0;
  updateStats();
}

btnStartEl.addEventListener("click", () => {
  menuStartEl.classList.add("hidden");
  containerEl.classList.remove("hidden");
  menuDiffEl.classList.remove("hidden");
  menuPlayEl.classList.add("hidden");
});

btnRestartEl.addEventListener("click", () => {
  if (scoreBoardEl) scoreBoardEl.classList.add("hidden");
  containerEl.classList.remove("hidden");
  menuDiffEl.classList.remove("hidden");
  resetGame();
});

btnHomeEl.addEventListener("click", () => {
  if (scoreBoardEl) scoreBoardEl.classList.add("hidden");
  menuStartEl.classList.remove("hidden");
  containerEl.classList.add("hidden");
  resetGame();
  stopGame();
  showOverlay();
});

btnDiffEl.forEach((btn) => {
  btn.addEventListener("click", () => {
    diffGame = btn.dataset.diff;
    menuDiffEl.classList.add("hidden");
    menuPlayEl.classList.remove("hidden");
  });
});

btnBackEl.forEach((back) => {
  back.addEventListener("click", () => {
    menuStartEl.classList.remove("hidden");
    containerEl.classList.add("hidden");
    menuDiffEl.classList.add("hidden");
    menuPlayEl.classList.add("hidden");
  });
});

btnPlayEl.addEventListener("click", () => {
  setupAudioForDiff();
  startGame();
});

btnBackEl2.addEventListener("click", () => {
  isPlaying = false;
  setOrbitEnabled(true);
  showOverlay();
  resetCamera(new THREE.Vector3(0, 0, 100), new THREE.Vector3(0, 0, 0));
  if (controls && controls.reset) controls.reset();

  gameSectionEl.classList.add("hidden");
  menuStartEl.classList.remove("hidden");
  containerEl.classList.add("hidden");
  menuDiffEl.classList.add("hidden");
  menuPlayEl.classList.add("hidden");
  resetGame();
  stopGame();
});
