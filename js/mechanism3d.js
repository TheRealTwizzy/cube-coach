// Interactive cutaway-style viewer for the physical cube mechanism.
(function (root) {
  'use strict';
  const Mechanism = root.CubeMechanism;
  const HEX = { w: 0xf4f4ef, y: 0xffd200, g: 0x00a04a, b: 0x0b4fc4, r: 0xc8102e, o: 0xff6a13 };

  function MechanismView(container, onSelect) {
    const T = root.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Interactive cube mechanism. Drag to orbit, use the wheel to zoom, or use arrow keys to look around.');
    canvas.style.touchAction = 'none';
    container.appendChild(canvas);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(32, 1, 0.1, 100);
    scene.add(new T.HemisphereLight(0xffffff, 0x68717e, 1.2));
    const key = new T.DirectionalLight(0xffffff, 1.05);
    key.position.set(5, 8, 7);
    scene.add(key);
    const fill = new T.DirectionalLight(0x9ebeff, 0.25);
    fill.position.set(-5, 1, -4);
    scene.add(fill);
    const assembly = new T.Group();
    scene.add(assembly);
    const pieceGroups = new Map();
    const raycaster = new T.Raycaster();
    const pointer = new T.Vector2();
    const orbit = { yaw: 0.7, pitch: 0.46, distance: 9.2 };
    let selected = null, drag = null;

    const bodyGeo = new T.BoxGeometry(0.94, 0.94, 0.94);
    const stickerGeo = new T.BoxGeometry(0.76, 0.76, 0.035);
    const armGeo = new T.CylinderGeometry(0.1, 0.1, 1, 12);
    const yAxis = new T.Vector3(0, 1, 0);

    function render() { renderer.render(scene, camera); }
    function setCamera() {
      const r = orbit.distance, cp = Math.cos(orbit.pitch);
      camera.position.set(r * Math.sin(orbit.yaw) * cp, r * Math.sin(orbit.pitch), r * Math.cos(orbit.yaw) * cp);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }
    function resize() {
      const width = container.clientWidth, height = container.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      setCamera();
      render();
    }
    if (root.ResizeObserver) new root.ResizeObserver(resize).observe(container);
    else root.addEventListener('resize', resize);

    function makeSticker(sticker) {
      const mesh = new T.Mesh(stickerGeo, new T.MeshLambertMaterial({ color: HEX[sticker.color] }));
      const normal = new T.Vector3(...sticker.normal);
      mesh.position.copy(normal.multiplyScalar(0.485));
      mesh.lookAt(normal.multiplyScalar(2));
      return mesh;
    }
    function makePiece(part) {
      const group = new T.Group();
      group.userData.part = part;
      const body = new T.Mesh(bodyGeo, new T.MeshLambertMaterial({ color: 0x17191d }));
      group.userData.body = body;
      group.add(body);
      part.stickers.forEach(sticker => group.add(makeSticker(sticker)));
      assembly.add(group);
      pieceGroups.set(part.id, group);
      return group;
    }
    function makeCore() {
      const group = new T.Group();
      group.userData.part = { id: 'core', kind: 'core' };
      const hub = new T.Mesh(new T.SphereGeometry(0.48, 24, 16), new T.MeshLambertMaterial({ color: 0x272d35 }));
      group.userData.body = hub;
      group.add(hub);
      group.userData.arms = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(direction => {
        const arm = new T.Mesh(armGeo, new T.MeshLambertMaterial({ color: 0x39434f }));
        arm.quaternion.setFromUnitVectors(yAxis, new T.Vector3(...direction));
        group.add(arm);
        return { arm, direction };
      });
      assembly.add(group);
      pieceGroups.set('core', group);
    }
    makeCore();
    Mechanism.partsAt(0).filter(part => part.kind !== 'core').forEach(makePiece);

    function paintSelection() {
      pieceGroups.forEach(group => {
        const body = group.userData.body;
        if (body && body.material.emissive) body.material.emissive.setHex(group.userData.part.id === selected ? 0x344e70 : 0x000000);
      });
    }
    function choose(part) {
      if (!part) return;
      selected = part.id;
      paintSelection();
      if (onSelect) onSelect(part);
      render();
    }
    function pick(event) {
      const box = canvas.getBoundingClientRect();
      pointer.x = ((event.clientX - box.left) / box.width) * 2 - 1;
      pointer.y = -((event.clientY - box.top) / box.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(assembly.children, true)[0];
      if (!hit) return;
      let node = hit.object;
      while (node && !node.userData.part) node = node.parent;
      if (node && node.userData.part) choose(node.userData.part);
    }
    function moveOrbit(dx, dy) {
      orbit.yaw -= dx * 0.012;
      orbit.pitch = Math.max(-1.25, Math.min(1.25, orbit.pitch - dy * 0.012));
      setCamera(); render();
    }
    canvas.addEventListener('pointerdown', event => {
      drag = { x: event.clientX, y: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
    });
    canvas.addEventListener('pointermove', event => {
      if (!drag) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      drag.x = event.clientX; drag.y = event.clientY;
      if (drag.moved) moveOrbit(dx, dy);
    });
    const endDrag = event => {
      if (!drag) return;
      if (!drag.moved) pick(event);
      drag = null;
      canvas.style.cursor = '';
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', event => {
      event.preventDefault();
      orbit.distance = Math.max(4.8, Math.min(20, orbit.distance + event.deltaY * 0.012));
      setCamera(); render();
    }, { passive: false });
    canvas.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') moveOrbit(-20, 0);
      else if (event.key === 'ArrowRight') moveOrbit(20, 0);
      else if (event.key === 'ArrowUp') moveOrbit(0, -20);
      else if (event.key === 'ArrowDown') moveOrbit(0, 20);
      else if (event.key === '+' || event.key === '=') { orbit.distance = Math.max(4.8, orbit.distance - 0.7); setCamera(); render(); }
      else if (event.key === '-') { orbit.distance = Math.min(20, orbit.distance + 0.7); setCamera(); render(); }
      else if (event.key === 'Home') this.resetView();
      else return;
      event.preventDefault();
    });

    this.setExplosion = amount => {
      const parts = Mechanism.partsAt(amount);
      const progress = Math.max(0, Math.min(1, Number(amount) || 0));
      // Keep the complete mechanism in frame as the slider opens it; learners can
      // still zoom closer with the wheel after choosing a part.
      orbit.distance = 9.2 + progress * 8.5;
      parts.forEach(part => {
        const group = pieceGroups.get(part.id);
        if (!group) return;
        group.position.set(...part.position);
        group.userData.part = part;
        if (part.kind === 'core') {
          const length = 1 + progress * 1.7;
          group.userData.arms.forEach(({ arm, direction }) => {
            const dir = new T.Vector3(...direction);
            arm.position.copy(dir.multiplyScalar(length / 2));
            arm.scale.set(1, length, 1);
          });
        }
      });
      paintSelection(); setCamera(); render();
    };
    this.selectKind = kind => {
      const part = [...pieceGroups.values()].map(group => group.userData.part).find(item => item.kind === kind);
      choose(part);
    };
    this.resetView = () => {
      orbit.yaw = 0.7; orbit.pitch = 0.46; orbit.distance = 9.2;
      setCamera(); render();
    };
    this.resize = resize;
    this.setExplosion(0);
    resize();
  }

  root.MechanismView = MechanismView;
})(this);
