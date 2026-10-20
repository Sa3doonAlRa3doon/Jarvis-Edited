import * as THREE from '/vendor/three/three.module.js';

const systemNodes = [
  ['system', 'JARVIS', 'system'], ['docker', 'DOCKER MATRIX', 'service'], ['printer', 'FABRICATOR', 'printer'],
  ['agents', 'CODEX', 'agent'], ['research', 'PROSPECTOR', 'research'], ['google', 'GOOGLE', 'service'],
  ['memory', 'SECOND BRAIN', 'memory'], ['settings', 'SENTINEL', 'service']
].map(([id, name, type], index) => ({ id: `system-${id}`, name, path: name, type, depth: 0, system: true, index }));

function hash(value) {
  let number = 2166136261;
  for (const character of String(value)) { number ^= character.charCodeAt(0); number = Math.imul(number, 16777619); }
  return number >>> 0;
}

function nodeColor(node) {
  if (node.type === 'printer') return 0xf5bd5c;
  if (node.type === 'folder' || node.type === 'root') return 0x64e8ff;
  if (node.type === 'agent' || node.type === 'research') return 0x71ffca;
  return 0x5792aa;
}

export async function createKnowledgeGalaxy({ canvas, inspector, onStatus = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.8, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x010508, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 400);
  camera.position.set(0, 1.25, 23);
  const world = new THREE.Group(); scene.add(world);
  scene.add(new THREE.AmbientLight(0x255d72, 2.2));
  const pointLight = new THREE.PointLight(0x64e8ff, 52, 90); pointLight.position.set(-2, 1, 8); scene.add(pointLight);
  const goldLight = new THREE.PointLight(0xf5bd5c, 22, 60); goldLight.position.set(7, 6, 4); scene.add(goldLight);
  const magentaLight = new THREE.PointLight(0xee5aa7, 5, 45); magentaLight.position.set(-7, 5, 2); scene.add(magentaLight);

  const starPositions = new Float32Array(900 * 3);
  for (let index = 0; index < starPositions.length; index += 3) {
    const radius = 25 + Math.random() * 65; const theta = Math.random() * Math.PI * 2; const phi = Math.acos(2 * Math.random() - 1);
    starPositions[index] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[index + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[index + 2] = radius * Math.cos(phi);
  }
  const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0x5ad8f3, size: .045, transparent: true, opacity: .22, blending: THREE.AdditiveBlending, depthWrite: false })); scene.add(stars);

  const glowCanvas = document.createElement('canvas'); glowCanvas.width = 256; glowCanvas.height = 256;
  const glowContext = glowCanvas.getContext('2d');
  const glowGradient = glowContext.createRadialGradient(128, 128, 0, 128, 128, 128);
  glowGradient.addColorStop(0, 'rgba(224,253,255,.94)'); glowGradient.addColorStop(.055, 'rgba(100,232,255,.72)');
  glowGradient.addColorStop(.22, 'rgba(59,190,225,.23)'); glowGradient.addColorStop(.52, 'rgba(25,117,158,.045)'); glowGradient.addColorStop(1, 'rgba(0,0,0,0)');
  glowContext.fillStyle = glowGradient; glowContext.fillRect(0, 0, 256, 256);
  const glowTexture = new THREE.CanvasTexture(glowCanvas); glowTexture.colorSpace = THREE.SRGBColorSpace;
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: 0xa8f7ff, transparent: true, opacity: .42, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreGlow.scale.set(8.4, 8.4, 1); world.add(coreGlow);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.05, 3),
    new THREE.MeshPhysicalMaterial({ color: 0x061c27, emissive: 0x38c9e8, emissiveIntensity: 1.35, wireframe: true, transparent: true, opacity: .11, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  world.add(core);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(2.72, .018, 7, 140), new THREE.MeshBasicMaterial({ color: 0x64e8ff, transparent: true, opacity: .36, blending: THREE.AdditiveBlending, depthWrite: false }));
  coreRing.rotation.x = 1.12; world.add(coreRing);

  const brainPositions = []; const brainColors = []; const palette = [new THREE.Color(0x64e8ff), new THREE.Color(0xf5bd5c), new THREE.Color(0x8ddff0), new THREE.Color(0x71ffca)];
  for (let index = 0; index < 5200; index += 1) {
    const u = ((index * 0.61803398875) % 1) * 2 - 1; const theta = index * 2.3999632297; const fill = ((index * 149) % 997) / 997;
    const shell = .72 + Math.pow(fill, .48) * 5.7; const lobe = 1 + .11 * Math.sin(theta * 3.1 + u * 4.2) + .055 * Math.cos(theta * 7.3 - u * 2.4);
    const radial = Math.sqrt(Math.max(0, 1 - u * u));
    const x = Math.cos(theta) * radial * shell * 1.08 * lobe; const y = u * shell * .79; const z = Math.sin(theta) * radial * shell * .8 * (1 + .08 * Math.cos(theta * 2.2));
    brainPositions.push(x, y, z);
    const zone = y > 1.55 ? 2 : y < -1.35 ? 3 : x > 1.4 ? 1 : 0; const color = palette[zone].clone();
    const brightness = .66 + (((index * 67) % 100) / 100) * .52; color.multiplyScalar(brightness); brainColors.push(color.r, color.g, color.b);
  }
  const brainGeometry = new THREE.BufferGeometry();
  const baseFormation = Float32Array.from(brainPositions);
  let currentFormation = Float32Array.from(baseFormation);
  let activeMode = 'system';
  let morphProgress = 1;

  function formationFor(mode) {
    if (mode === 'system') return Float32Array.from(baseFormation);
    const output = new Float32Array(baseFormation.length);
    const count = baseFormation.length / 3;
    for (let point = 0; point < count; point += 1) {
      const offset = point * 3; const t = point / count; const seed = ((point * 149) % 997) / 997;
      const bx = baseFormation[offset]; const by = baseFormation[offset + 1]; const bz = baseFormation[offset + 2];
      let x = bx; let y = by; let z = bz;
      if (mode === 'docker') {
        const angle = point * 2.3999632297; const band = (point % 17) / 17;
        const radius = 2.2 + band * 4.7; x = Math.cos(angle) * radius; z = Math.sin(angle) * radius * .66; y = (seed - .5) * 7.4 + Math.sin(angle * 3) * .18;
      } else if (mode === 'printer') {
        const angle = t * Math.PI * 23; const radius = 1.7 + seed * 2.4;
        x = Math.cos(angle) * radius; z = Math.sin(angle) * radius * .78; y = (t - .5) * 10.6;
      } else if (mode === 'agents') {
        const lane = point % 3; const angle = t * Math.PI * 18 + lane * Math.PI * .66; const radius = 2.15 + lane * 1.38;
        x = Math.cos(angle) * radius + (lane - 1) * 1.2; z = Math.sin(angle) * radius * .58; y = (seed - .5) * 9.2;
      } else if (mode === 'research') {
        const theta = point * 2.3999632297; const u = seed * 2 - 1; const radial = Math.sqrt(Math.max(0, 1 - u * u)); const ray = 1.3 + Math.pow(((point * 83) % 251) / 251, .43) * 7.1;
        x = Math.cos(theta) * radial * ray; y = u * ray * .82; z = Math.sin(theta) * radial * ray * .78;
      } else if (mode === 'memory') {
        const major = 4.55; const minor = 1.15 + seed * 1.05; const a = t * Math.PI * 18; const b = point * 2.3999632297;
        x = (major + minor * Math.cos(b)) * Math.cos(a); y = minor * Math.sin(b) * 1.55; z = (major + minor * Math.cos(b)) * Math.sin(a) * .62;
      }
      output[offset] = x; output[offset + 1] = y; output[offset + 2] = z;
    }
    return output;
  }

  brainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(brainPositions, 3));
  brainGeometry.setAttribute('aFrom', new THREE.BufferAttribute(Float32Array.from(baseFormation), 3));
  brainGeometry.setAttribute('aTo', new THREE.BufferAttribute(Float32Array.from(baseFormation), 3));
  brainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(brainColors, 3));
  const brainMaterial = new THREE.PointsMaterial({ size: .078, vertexColors: true, transparent: true, opacity: .76, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false });
  brainMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uMorph = { value: 1 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uMorph;\nattribute vec3 aFrom;\nattribute vec3 aTo;');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      float easedMorph = uMorph * uMorph * (3.0 - 2.0 * uMorph);
      vec3 transformed = mix(aFrom, aTo, easedMorph);
      float phase = position.x * 1.21 + position.y * .87 + position.z * .63;
      float pulse = 1.0 + .052 * sin(uTime * 1.16 + phase) + .024 * sin(uTime * .43 + position.y * 2.35);
      transformed *= pulse;
      transformed.x += .20 * sin(uTime * .54 + position.y * .95);
      transformed.y += .11 * sin(uTime * .72 + position.x * .58);
    `);
    brainMaterial.userData.shader = shader;
  };
  brainMaterial.customProgramCacheKey = () => 'jarvis-neural-morph-v4';
  const brainCloud = new THREE.Points(brainGeometry, brainMaterial); world.add(brainCloud);

  const sparkPositions = []; const sparkColors = [];
  for (let index = 0; index < 620; index += 1) {
    const theta = index * 2.3999632297; const u = ((index * .754877666) % 1) * 2 - 1; const radius = .45 + Math.pow(((index * 83) % 251) / 251, .72) * 4.15; const radial = Math.sqrt(Math.max(0, 1 - u * u));
    sparkPositions.push(Math.cos(theta) * radial * radius, u * radius * .72, Math.sin(theta) * radial * radius * .74);
    const color = index % 5 === 0 ? palette[1] : index % 7 === 0 ? palette[3] : new THREE.Color(0xc9fbff); sparkColors.push(color.r, color.g, color.b);
  }
  const sparkGeometry = new THREE.BufferGeometry(); sparkGeometry.setAttribute('position', new THREE.Float32BufferAttribute(sparkPositions, 3)); sparkGeometry.setAttribute('color', new THREE.Float32BufferAttribute(sparkColors, 3));
  const sparks = new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: .045, vertexColors: true, transparent: true, opacity: .38, blending: THREE.AdditiveBlending, depthWrite: false })); world.add(sparks);

  const filamentPositions = []; const filamentColors = [];
  for (let index = 0; index < 56; index += 1) {
    const angle = index * 2.3999632297; const y = (((index * 73) % 100) / 100 - .5) * 8.5; const inner = 3.1 + (index % 9) * .22; const outer = 7.2 + (index % 17) * .27; const color = palette[index % palette.length];
    let previous = null;
    for (let segment = 0; segment <= 5; segment += 1) {
      const mix = segment / 5; const radius = inner + (outer - inner) * mix; const bend = Math.sin(index * 1.7 + mix * Math.PI) * .28 * mix;
      const point = [Math.cos(angle + bend) * radius, y * (.34 + mix * .66) + Math.sin(mix * Math.PI) * ((index % 5) - 2) * .16, Math.sin(angle + bend) * radius * .76];
      if (previous) { filamentPositions.push(...previous, ...point); filamentColors.push(color.r, color.g, color.b, color.r, color.g, color.b); }
      previous = point;
    }
  }
  const filamentGeometry = new THREE.BufferGeometry(); filamentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(filamentPositions, 3)); filamentGeometry.setAttribute('color', new THREE.Float32BufferAttribute(filamentColors, 3));
  const filamentMaterial = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false });
  const filaments = new THREE.LineSegments(filamentGeometry, filamentMaterial); world.add(filaments);

  const orbitalRings = [];
  for (const [radius, opacity, tilt, color] of [[4.95, .23, 1.05, 0x9af6ff], [5.85, .11, .42, 0xf5bd5c], [6.65, .065, 1.48, 0x71ffca]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .014, 5, 220), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = tilt; ring.rotation.y = tilt * .3; world.add(ring); orbitalRings.push(ring);
  }
  const tickPositions = [];
  for (let index = 0; index < 120; index += 1) { const angle = index / 120 * Math.PI * 2; const inner = index % 5 === 0 ? 6.85 : 7.02; tickPositions.push(Math.cos(angle) * inner, Math.sin(angle) * inner, 0, Math.cos(angle) * 7.25, Math.sin(angle) * 7.25, 0); }
  const tickGeometry = new THREE.BufferGeometry(); tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3));
  const ticks = new THREE.LineSegments(tickGeometry, new THREE.LineBasicMaterial({ color: 0x64e8ff, transparent: true, opacity: .09 })); ticks.rotation.x = 1.1; world.add(ticks);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes = [];
  const meshById = new Map();
  let knowledge = { nodes: [], links: [], summary: {} };
  let selected = null;
  let focusPoint = new THREE.Vector3(0, 0, 0);
  let targetDistance = 23;
  let dragging = false;
  let previousPointer = null;
  let gesturePinched = false;
  let gesturePrevious = null;

  const modeColors = { system: 0x64e8ff, docker: 0x71ffca, printer: 0xf5bd5c, agents: 0xee76b8, research: 0x84f6d5, memory: 0x92b8ff };

  function setMode(mode = 'system') {
    if (!Object.hasOwn(modeColors, mode)) mode = 'system';
    const next = formationFor(mode);
    const from = brainGeometry.getAttribute('aFrom'); const to = brainGeometry.getAttribute('aTo');
    from.array.set(currentFormation); to.array.set(next); from.needsUpdate = true; to.needsUpdate = true;
    currentFormation = next; activeMode = mode; morphProgress = 0;
    const color = modeColors[mode]; pointLight.color.setHex(color); core.material.emissive.setHex(color); coreRing.material.color.setHex(color); coreGlow.material.color.setHex(color);
    orbitalRings[0]?.material.color.setHex(color); targetDistance = mode === 'research' ? 25 : mode === 'printer' ? 21 : 23; focusPoint.set(0, 0, 0);
    onStatus(`MATRIX // ${mode.toUpperCase()}`); return mode;
  }

  function clearKnowledge() {
    for (const mesh of meshes.splice(0)) { world.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const child of [...world.children]) if (child.userData?.link) { world.remove(child); child.geometry.dispose(); child.material.dispose(); }
    meshById.clear();
  }

  function positionFor(node, index, total) {
    if (node.system) {
      const angle = (index / systemNodes.length) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 8.05, Math.sin(angle) * 4.85, Math.sin(angle * 2) * 2.35);
    }
    const seed = hash(node.id); const shell = 9.2 + Math.min(4, Number(node.depth) || 0) * 2.35 + (seed % 100) / 90;
    const angle = ((index / Math.max(1, total)) * Math.PI * 2 * 3.2) + (seed % 1000) / 1000;
    const y = (((seed >>> 8) % 1000) / 1000 - .5) * Math.min(15, shell * 1.15);
    const radial = Math.sqrt(Math.max(.12, 1 - (y / shell) ** 2)) * shell;
    return new THREE.Vector3(Math.cos(angle) * radial, y, Math.sin(angle) * radial * .72);
  }

  function buildGraph() {
    clearKnowledge();
    const nodes = [...systemNodes, ...(knowledge.nodes || [])];
    nodes.forEach((node, index) => {
      const radius = node.system ? .34 : node.type === 'root' ? .31 : node.type === 'folder' ? .2 : .105;
      const geometry = node.type === 'folder' || node.type === 'root' ? new THREE.OctahedronGeometry(radius, 0) : new THREE.IcosahedronGeometry(radius, node.system ? 1 : 0);
      const color = nodeColor(node);
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: node.system ? 1.05 : .34, transparent: true, opacity: node.system ? .82 : .38, roughness: .28, metalness: .25 });
      const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(positionFor(node, index, nodes.length)); mesh.userData.node = node;
      world.add(mesh); meshes.push(mesh); meshById.set(node.id, mesh);
      if (node.system) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.7, .015, 5, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .4 }));
        ring.userData.link = true; ring.position.copy(mesh.position); ring.rotation.x = Math.PI / 2; world.add(ring);
        const labelCanvas = document.createElement('canvas'); labelCanvas.width = 320; labelCanvas.height = 64; const labelContext = labelCanvas.getContext('2d');
        labelContext.clearRect(0, 0, 320, 64); labelContext.font = '500 20px monospace'; labelContext.fillStyle = `#${color.toString(16).padStart(6, '0')}`; labelContext.fillText(node.name, 8, 39);
        const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: .48, depthWrite: false })); sprite.scale.set(3.3, .66, 1); sprite.position.copy(mesh.position).add(new THREE.Vector3(.55, .52, 0)); sprite.userData.link = true; world.add(sprite);
      }
    });
    const positionPairs = [];
    for (const link of knowledge.links || []) {
      const source = meshById.get(link.source); const target = meshById.get(link.target);
      if (source && target) positionPairs.push(...source.position.toArray(), ...target.position.toArray());
    }
    for (const mesh of meshes.filter((item) => item.userData.node.system)) positionPairs.push(0, 0, 0, ...mesh.position.toArray());
    if (positionPairs.length) {
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionPairs, 3));
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x3cb5d5, transparent: true, opacity: .045 })); lines.userData.link = true; world.add(lines);
    }
    onStatus(`${knowledge.summary?.nodes || 0} FILE NODES`);
  }

  function setInspector(node) {
    if (!inspector) return;
    inspector.hidden = false;
    inspector.querySelector('[data-node-kind]').textContent = String(node.type || 'node').toUpperCase();
    inspector.querySelector('[data-node-name]').textContent = node.name || 'UNKNOWN';
    inspector.querySelector('[data-node-path]').textContent = node.system ? 'JARVIS SYSTEM ORBIT' : node.path || '';
  }

  function selectMesh(mesh) {
    if (!mesh) return false;
    if (selected) { selected.scale.setScalar(1); selected.material.emissiveIntensity = selected.userData.node.system ? 1.15 : .55; }
    selected = mesh; selected.scale.setScalar(2.15); selected.material.emissiveIntensity = 3.2;
    focusPoint.copy(selected.position); targetDistance = Math.max(11, Math.min(22, 13 + selected.position.length() * .18));
    setInspector(selected.userData.node); onStatus(`FOCUS // ${selected.userData.node.name}`); return true;
  }

  function raycastAt(x, y) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((x - rect.left) / rect.width) * 2 - 1; pointer.y = -((y - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera); return raycaster.intersectObjects(meshes, false)[0]?.object || null;
  }

  function focusFromText(text) {
    const query = String(text || '').toLowerCase();
    if (!query) return false;
    let match = meshes.find((mesh) => query.includes(String(mesh.userData.node.name).toLowerCase()));
    if (!match) {
      const words = query.split(/[^a-z0-9_.-]+/).filter((item) => item.length > 2);
      match = meshes.map((mesh) => ({ mesh, score: words.filter((word) => `${mesh.userData.node.name} ${mesh.userData.node.path}`.toLowerCase().includes(word)).length }))
        .sort((left, right) => right.score - left.score)[0];
      match = match?.score ? match.mesh : null;
    }
    return selectMesh(match);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect(); const width = Math.max(1, Math.round(rect.width)); const height = Math.max(1, Math.round(rect.height));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  }

  canvas.addEventListener('pointerdown', (event) => { dragging = true; previousPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !previousPointer) return;
    world.rotation.y += (event.clientX - previousPointer.x) * .006; world.rotation.x += (event.clientY - previousPointer.y) * .003;
    previousPointer = { x: event.clientX, y: event.clientY };
  });
  canvas.addEventListener('pointerup', (event) => {
    if (previousPointer && Math.hypot(event.clientX - previousPointer.x, event.clientY - previousPointer.y) < 4) selectMesh(raycastAt(event.clientX, event.clientY));
    dragging = false; previousPointer = null;
  });
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); targetDistance = Math.max(10, Math.min(44, targetDistance + event.deltaY * .022)); }, { passive: false });
  canvas.addEventListener('dblclick', () => setMode('system'));

  function gesture({ x, y, pinched, hands = 1, spread = 0 }) {
    const rect = canvas.getBoundingClientRect(); const clientX = rect.left + x * rect.width; const clientY = rect.top + y * rect.height;
    if (pinched && !gesturePinched) selectMesh(raycastAt(clientX, clientY));
    if (pinched && gesturePrevious) { world.rotation.y += (x - gesturePrevious.x) * 3.2; world.rotation.x += (y - gesturePrevious.y) * 2; }
    if (hands > 1 && spread > 0) targetDistance = Math.max(10, Math.min(44, 38 - spread * 42));
    gesturePinched = pinched; gesturePrevious = { x, y };
  }

  const clock = new THREE.Clock();
  function animate() {
    const elapsed = clock.getElapsedTime();
    morphProgress = Math.min(1, morphProgress + .018);
    core.rotation.x = elapsed * .08; core.rotation.y = elapsed * .16; coreRing.rotation.z = elapsed * .11;
    if (brainMaterial.userData.shader) { brainMaterial.userData.shader.uniforms.uTime.value = elapsed; brainMaterial.userData.shader.uniforms.uMorph.value = morphProgress; }
    const breath = 1 + Math.sin(elapsed * 1.12) * .018;
    brainCloud.scale.set(breath * (1 + Math.sin(elapsed * .39) * .018), breath * (1 + Math.sin(elapsed * .53 + 1) * .022), breath);
    brainCloud.rotation.y = elapsed * .025; brainCloud.rotation.x = Math.sin(elapsed * .11) * .075;
    sparks.rotation.y = -elapsed * .032; sparks.rotation.z = Math.sin(elapsed * .21) * .055;
    filaments.rotation.y = elapsed * .014; filaments.rotation.x = Math.sin(elapsed * .16) * .045; filamentMaterial.opacity = .075 + Math.sin(elapsed * 1.34) * .025;
    coreGlow.material.opacity = .31 + Math.sin(elapsed * 1.45) * .08; coreGlow.scale.setScalar(8.1 + Math.sin(elapsed * 1.08) * .42);
    orbitalRings.forEach((ring, index) => { ring.rotation.z += (index % 2 ? -1 : 1) * (.00042 + index * .00008); });
    ticks.rotation.z = -elapsed * .03;
    stars.rotation.y = elapsed * .004;
    if (!dragging && !gesturePinched) world.rotation.y += activeMode === 'printer' ? .00115 : activeMode === 'research' ? .00135 : .00072;
    for (let index = 0; index < meshes.length; index += 1) {
      const mesh = meshes[index]; mesh.rotation.y += .002 + (index % 4) * .0005;
      if (mesh !== selected) mesh.scale.setScalar(1 + Math.sin(elapsed * 1.4 + index) * .055);
    }
    const desired = new THREE.Vector3(focusPoint.x * .22, focusPoint.y * .22 + .65, targetDistance);
    camera.position.lerp(desired, .035); camera.lookAt(focusPoint.clone().multiplyScalar(.48));
    renderer.render(scene, camera); requestAnimationFrame(animate);
  }

  resize(); window.addEventListener('resize', resize); animate();
  try { knowledge = await fetch('/api/knowledge').then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }); buildGraph(); }
  catch (error) { onStatus(`INDEX OFFLINE // ${error.message}`); knowledge = { nodes: [], links: [], summary: {} }; buildGraph(); }

  return { focusFromText, gesture, resize, setMode, selectById: (id) => selectMesh(meshById.get(id)), get selected() { return selected?.userData?.node || null; }, get mode() { return activeMode; } };
}

