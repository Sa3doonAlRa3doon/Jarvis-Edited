import * as THREE from '/vendor/three/three.module.js';

const systemNodes = [
  ['system', 'SYSTEM CORE', 'system'], ['docker', 'DOCKER', 'service'], ['printer', '3D PRINTER', 'printer'],
  ['agents', 'AGENT TRACES', 'agent'], ['research', 'RESEARCH', 'research'], ['google', 'GOOGLE', 'service'],
  ['memory', 'MEMORY', 'memory'], ['settings', 'SETTINGS', 'service']
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
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02070b, 0.022);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
  camera.position.set(0, 2.5, 32);
  const world = new THREE.Group(); scene.add(world);
  scene.add(new THREE.AmbientLight(0x255d72, 1.8));
  const pointLight = new THREE.PointLight(0x64e8ff, 38, 80); pointLight.position.set(0, 0, 8); scene.add(pointLight);
  const goldLight = new THREE.PointLight(0xf5bd5c, 12, 50); goldLight.position.set(-15, 9, 2); scene.add(goldLight);

  const starPositions = new Float32Array(1100 * 3);
  for (let index = 0; index < starPositions.length; index += 3) {
    const radius = 25 + Math.random() * 65; const theta = Math.random() * Math.PI * 2; const phi = Math.acos(2 * Math.random() - 1);
    starPositions[index] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[index + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[index + 2] = radius * Math.cos(phi);
  }
  const starsGeometry = new THREE.BufferGeometry(); starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0x5ad8f3, size: .075, transparent: true, opacity: .5 })); scene.add(stars);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.05, 3),
    new THREE.MeshPhysicalMaterial({ color: 0x092c3a, emissive: 0x1ea5c7, emissiveIntensity: 1.5, wireframe: true, transparent: true, opacity: .72 })
  );
  world.add(core);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(3.25, .018, 8, 140), new THREE.MeshBasicMaterial({ color: 0x64e8ff, transparent: true, opacity: .38 }));
  coreRing.rotation.x = 1.12; world.add(coreRing);

  const brainPositions = []; const brainColors = []; const palette = [new THREE.Color(0x64e8ff), new THREE.Color(0xf5bd5c), new THREE.Color(0xee5aa7), new THREE.Color(0x71ffca)];
  for (let index = 0; index < 5200; index += 1) {
    const u = ((index * 0.61803398875) % 1) * 2 - 1; const theta = index * 2.3999632297; const shell = 2.25 + ((index * 37) % 100) / 100 * 2.65;
    const squash = .8 + .2 * Math.sin(theta * 3.1); const radial = Math.sqrt(1 - u * u);
    const x = Math.cos(theta) * radial * shell * squash; const y = u * shell * .83; const z = Math.sin(theta) * radial * shell * (.7 + .3 * Math.cos(theta * 2.2));
    brainPositions.push(x, y, z);
    const zone = y > 1.4 ? 1 : y < -1.2 ? 2 : x > 1.5 ? 3 : 0; const color = palette[zone]; brainColors.push(color.r, color.g, color.b);
  }
  const brainGeometry = new THREE.BufferGeometry(); brainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(brainPositions, 3)); brainGeometry.setAttribute('color', new THREE.Float32BufferAttribute(brainColors, 3));
  const brainCloud = new THREE.Points(brainGeometry, new THREE.PointsMaterial({ size: .055, vertexColors: true, transparent: true, opacity: .7, sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false })); world.add(brainCloud);

  const filamentPositions = []; const filamentColors = [];
  for (let index = 0; index < 170; index += 1) {
    const angle = index * 2.3999632297; const y = (((index * 73) % 100) / 100 - .5) * 6.5; const inner = 2.2 + (index % 9) * .24; const outer = 5.2 + (index % 17) * .34;
    const x1 = Math.cos(angle) * inner; const z1 = Math.sin(angle) * inner * .72; const x2 = Math.cos(angle + Math.sin(index) * .16) * outer; const z2 = Math.sin(angle + Math.cos(index) * .13) * outer * .72;
    filamentPositions.push(x1, y * .42, z1, x2, y, z2);
    const color = palette[index % palette.length]; filamentColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
  }
  const filamentGeometry = new THREE.BufferGeometry(); filamentGeometry.setAttribute('position', new THREE.Float32BufferAttribute(filamentPositions, 3)); filamentGeometry.setAttribute('color', new THREE.Float32BufferAttribute(filamentColors, 3));
  const filaments = new THREE.LineSegments(filamentGeometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .2, blending: THREE.AdditiveBlending })); world.add(filaments);

  for (const [radius, opacity, tilt] of [[4.7, .24, 1.05], [5.35, .14, .42], [6.1, .09, 1.48]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .012, 5, 180), new THREE.MeshBasicMaterial({ color: 0x86edf9, transparent: true, opacity })); ring.rotation.x = tilt; ring.rotation.y = tilt * .3; world.add(ring);
  }
  const tickPositions = [];
  for (let index = 0; index < 180; index += 1) { const angle = index / 180 * Math.PI * 2; const inner = index % 5 === 0 ? 6.35 : 6.5; tickPositions.push(Math.cos(angle) * inner, Math.sin(angle) * inner, 0, Math.cos(angle) * 6.7, Math.sin(angle) * 6.7, 0); }
  const tickGeometry = new THREE.BufferGeometry(); tickGeometry.setAttribute('position', new THREE.Float32BufferAttribute(tickPositions, 3));
  const ticks = new THREE.LineSegments(tickGeometry, new THREE.LineBasicMaterial({ color: 0x64e8ff, transparent: true, opacity: .16 })); ticks.rotation.x = 1.1; world.add(ticks);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const meshes = [];
  const meshById = new Map();
  let knowledge = { nodes: [], links: [], summary: {} };
  let selected = null;
  let focusPoint = new THREE.Vector3(0, 0, 0);
  let targetDistance = 32;
  let dragging = false;
  let previousPointer = null;
  let gesturePinched = false;
  let gesturePrevious = null;

  function clearKnowledge() {
    for (const mesh of meshes.splice(0)) { world.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    for (const child of [...world.children]) if (child.userData?.link) { world.remove(child); child.geometry.dispose(); child.material.dispose(); }
    meshById.clear();
  }

  function positionFor(node, index, total) {
    if (node.system) {
      const angle = (index / systemNodes.length) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 7.1, Math.sin(angle) * 4.2, Math.sin(angle * 2) * 2.2);
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
      const radius = node.system ? .42 : node.type === 'root' ? .38 : node.type === 'folder' ? .26 : .13;
      const geometry = node.type === 'folder' || node.type === 'root' ? new THREE.OctahedronGeometry(radius, 0) : new THREE.IcosahedronGeometry(radius, node.system ? 1 : 0);
      const color = nodeColor(node);
      const material = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: node.system ? 1.15 : .55, transparent: true, opacity: node.system ? .95 : .78, roughness: .28, metalness: .25 });
      const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(positionFor(node, index, nodes.length)); mesh.userData.node = node;
      world.add(mesh); meshes.push(mesh); meshById.set(node.id, mesh);
      if (node.system) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.7, .015, 5, 36), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .4 }));
        ring.userData.link = true; ring.position.copy(mesh.position); ring.rotation.x = Math.PI / 2; world.add(ring);
        const labelCanvas = document.createElement('canvas'); labelCanvas.width = 320; labelCanvas.height = 64; const labelContext = labelCanvas.getContext('2d');
        labelContext.clearRect(0, 0, 320, 64); labelContext.font = '500 22px monospace'; labelContext.fillStyle = `#${color.toString(16).padStart(6, '0')}`; labelContext.fillText(node.name, 8, 39);
        const texture = new THREE.CanvasTexture(labelCanvas); texture.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: .72, depthWrite: false })); sprite.scale.set(3.5, .7, 1); sprite.position.copy(mesh.position).add(new THREE.Vector3(.55, .52, 0)); sprite.userData.link = true; world.add(sprite);
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
      const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0x3cb5d5, transparent: true, opacity: .13 })); lines.userData.link = true; world.add(lines);
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
    focusPoint.copy(selected.position); targetDistance = Math.max(12, Math.min(24, 14 + selected.position.length() * .2));
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
  canvas.addEventListener('wheel', (event) => { event.preventDefault(); targetDistance = Math.max(9, Math.min(54, targetDistance + event.deltaY * .025)); }, { passive: false });

  function gesture({ x, y, pinched, hands = 1, spread = 0 }) {
    const rect = canvas.getBoundingClientRect(); const clientX = rect.left + x * rect.width; const clientY = rect.top + y * rect.height;
    if (pinched && !gesturePinched) selectMesh(raycastAt(clientX, clientY));
    if (pinched && gesturePrevious) { world.rotation.y += (x - gesturePrevious.x) * 3.2; world.rotation.x += (y - gesturePrevious.y) * 2; }
    if (hands > 1 && spread > 0) targetDistance = Math.max(9, Math.min(54, 44 - spread * 48));
    gesturePinched = pinched; gesturePrevious = { x, y };
  }

  const clock = new THREE.Clock();
  function animate() {
    const elapsed = clock.getElapsedTime();
    core.rotation.x = elapsed * .08; core.rotation.y = elapsed * .16; coreRing.rotation.z = elapsed * .11;
    brainCloud.rotation.y = elapsed * .018; brainCloud.rotation.x = Math.sin(elapsed * .08) * .05; filaments.rotation.y = elapsed * .014; ticks.rotation.z = -elapsed * .025;
    stars.rotation.y = elapsed * .004;
    if (!dragging && !gesturePinched) world.rotation.y += .00055;
    for (let index = 0; index < meshes.length; index += 1) {
      const mesh = meshes[index]; mesh.rotation.y += .002 + (index % 4) * .0005;
      if (mesh !== selected) mesh.scale.setScalar(1 + Math.sin(elapsed * 1.4 + index) * .055);
    }
    const desired = new THREE.Vector3(focusPoint.x * .24, focusPoint.y * .24 + 1.2, targetDistance);
    camera.position.lerp(desired, .035); camera.lookAt(focusPoint.clone().multiplyScalar(.48));
    renderer.render(scene, camera); requestAnimationFrame(animate);
  }

  resize(); window.addEventListener('resize', resize); animate();
  try { knowledge = await fetch('/api/knowledge').then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }); buildGraph(); }
  catch (error) { onStatus(`INDEX OFFLINE // ${error.message}`); knowledge = { nodes: [], links: [], summary: {} }; buildGraph(); }

  return { focusFromText, gesture, resize, selectById: (id) => selectMesh(meshById.get(id)), get selected() { return selected?.userData?.node || null; } };
}
