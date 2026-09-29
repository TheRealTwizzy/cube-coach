// 3D cube view (three.js r128): 27 cubies with sticker planes, animated layer turns,
// drag to look around. Stickers are recolored from state after each turn, so cubies
// never keep a rotation.
(function (root) {
  'use strict';
  const M = root.CubeModel;
  const HEX = { w: 0xf4f4ef, y: 0xffd200, g: 0x00a04a, b: 0x0b4fc4, r: 0xc8102e, o: 0xff6a13, x: 0x6b717b };
  const VIEW_DIR = [0.55, 0.46, 0.7]; // camera sees top, front and right
  const FIT_RADIUS = 2.5;

  function roundedSquare(T, size, radius) {
    const s = size / 2, r = radius, shape = new T.Shape();
    shape.moveTo(-s + r, -s);
    shape.lineTo(s - r, -s);
    shape.quadraticCurveTo(s, -s, s, -s + r);
    shape.lineTo(s, s - r);
    shape.quadraticCurveTo(s, s, s - r, s);
    shape.lineTo(-s + r, s);
    shape.quadraticCurveTo(-s, s, -s, s - r);
    shape.lineTo(-s, -s + r);
    shape.quadraticCurveTo(-s, -s, -s + r, -s);
    return new T.ShapeGeometry(shape, 4);
  }

  function CubeView(container) {
    const T = root.THREE;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    const el = renderer.domElement;
    el.style.touchAction = 'none';
    container.appendChild(el);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
    scene.add(new T.AmbientLight(0xffffff, 0.75));
    const sun = new T.DirectionalLight(0xffffff, 0.45);
    sun.position.set(3, 8, 6);
    scene.add(sun);
    const group = new T.Group();
    scene.add(group);

    const bodyGeo = new T.BoxGeometry(0.96, 0.96, 0.96);
    const bodyMat = new T.MeshLambertMaterial({ color: 0x17191d });
    const stickerGeo = roundedSquare(T, 0.84, 0.12);
    const cubies = [];
    const byPos = new Map();
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const c = new T.Mesh(bodyGeo, bodyMat);
          c.position.set(x, y, z);
          c.userData.pos = [x, y, z];
          group.add(c);
          cubies.push(c);
          byPos.set(`${x},${y},${z}`, c);
        }
      }
    }
    const stickers = M.FACELETS.map(f => {
      const mesh = new T.Mesh(stickerGeo, new T.MeshLambertMaterial({ color: HEX.x }));
      const n = f.normal;
      mesh.position.set(n[0] * 0.49, n[1] * 0.49, n[2] * 0.49);
      mesh.lookAt(n[0] * 2, n[1] * 2, n[2] * 2);
      byPos.get(f.pos.join(',')).add(mesh);
      return mesh;
    });

    const render = () => renderer.render(scene, camera);
    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); // CSS sizes the canvas (100%); a fixed px width would stop the layout shrinking
      camera.aspect = w / h;
      const vfov = T.MathUtils.degToRad(camera.fov);
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
      const dist = FIT_RADIUS / Math.sin(Math.min(vfov, hfov) / 2);
      camera.position.set(VIEW_DIR[0], VIEW_DIR[1], VIEW_DIR[2]).normalize().multiplyScalar(dist);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      render();
    }
    if (root.ResizeObserver) new root.ResizeObserver(resize).observe(container);
    else root.addEventListener('resize', resize);
    resize();

    let drag = null;
    el.addEventListener('pointerdown', e => {
      drag = { x: e.clientX, y: e.clientY };
      el.setPointerCapture(e.pointerId);
      el.style.cursor = 'grabbing';
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      group.rotateOnWorldAxis(new T.Vector3(0, 1, 0), dx * 0.01);
      group.rotateOnWorldAxis(new T.Vector3(1, 0, 0).applyQuaternion(camera.quaternion), dy * 0.01);
      render();
    });
    const endDrag = () => { drag = null; el.style.cursor = ''; };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);
    el.addEventListener('dblclick', () => this.resetView());

    this.render = render;
    this.resetView = () => { group.quaternion.identity(); render(); };
    this.setState = state => {
      stickers.forEach((m, i) => m.material.color.setHex(HEX[state[i]] ?? HEX.x));
      render();
    };
    // Ends a running turn at once (its promise resolves), so another caller can take over the view.
    let active = null;
    this.finishAnimation = () => { if (active) active(); };
    this.animateMove = (move, ms) => new Promise(resolve => {
      if (!ms) { resolve(); return; }
      this.finishAnimation(); // two turns at once would tangle the cubies
      const g = M.moveGeometry(move);
      const pivot = new T.Object3D();
      group.add(pivot);
      const moving = cubies.filter(c => g.inLayer(c.userData.pos));
      moving.forEach(c => pivot.attach(c));
      const axis = new T.Vector3(g.axis[0], g.axis[1], g.axis[2]);
      const t0 = performance.now();
      let done = false, fallback = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (active === finish) active = null;
        clearTimeout(fallback);
        moving.forEach(c => {
          group.attach(c);
          c.position.set(c.userData.pos[0], c.userData.pos[1], c.userData.pos[2]);
          c.quaternion.identity();
        });
        group.remove(pivot);
        resolve(); // caller recolors via setState in the same task, so no frame shows the reset
      };
      const frame = now => {
        if (done) return;
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        pivot.setRotationFromAxisAngle(axis, g.angle * e);
        render();
        if (t < 1) requestAnimationFrame(frame);
        else finish();
      };
      // Browsers stop animation frames for hidden or covered windows; finish on time anyway
      // so playback never stalls.
      fallback = setTimeout(finish, ms + 250);
      active = finish;
      requestAnimationFrame(frame);
    });
  }

  root.CubeView = CubeView;
})(this);
