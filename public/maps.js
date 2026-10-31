// CampusPass — city map (OpenStreetMap + Leaflet) and indoor routes on the campus floor plans (F22),
// free rooms for organizers and the moderator (F21). Educational project; all data are fictional.
'use strict';
window.CPMaps = (function () {
  const W = 1920, H = 940; // size of the floor plan images
  // main corridor of every floor (same on all three floors) and vertical connections
  const K = [[250, 550], [420, 490], [650, 435], [800, 420], [960, 415], [1120, 420], [1270, 435], [1500, 490], [1680, 550]];
  const LINKS = [{ x: 393, y: 405, kind: 'lift', block: 'C1.1' }, { x: 666, y: 392, kind: 'stairs', block: 'C1.1' }, { x: 934, y: 328, kind: 'lift', block: 'C1.2' }, { x: 1254, y: 391, kind: 'stairs', block: 'C1.3' }, { x: 1527, y: 401, kind: 'lift', block: 'C1.3' }];
  const ENTRANCE = [960, 700], ATRIUM = [960, 560];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const nearestK = (p) => K.reduce((best, k, i) => (d2(k, p) < d2(K[best], p) ? i : best), 0);
  const along = (i, j) => (i <= j ? K.slice(i, j + 1) : K.slice(j, i + 1).reverse());

  // Route from the main entrance to a room: one polyline per floor and the steps to show
  function route(room) {
    const target = [room.x, room.y], floors = {};
    const start = [ENTRANCE, ATRIUM];
    if (room.code === 'C1.2.AT') { floors[1] = [ENTRANCE, target]; return { floors, link: null }; }
    if (room.floor === 1) { floors[1] = [...start, ...along(4, nearestK(target)), target]; return { floors, link: null }; }
    const link = LINKS.reduce((b, l) => (Math.abs(l.x - room.x) < Math.abs(b.x - room.x) ? l : b), LINKS[0]);
    const lp = [link.x, link.y];
    floors[1] = [...start, ...along(4, nearestK(lp)), lp];
    floors[room.floor] = [lp, ...along(nearestK(lp), nearestK(target)), target];
    return { floors, link };
  }

  function svgFloor(floor, room, path, t, showRoute) {
    const pts = (path || []).map((p) => p.join(',')).join(' ');
    const isTarget = room && room.floor === floor;
    const start = path && path[0], end = path && path[path.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" class="floorplan" role="img" aria-label="${t('floor_n', { n: floor })}">
      <image href="/floors/floor${floor}.png" x="0" y="0" width="${W}" height="${H}"/>
      ${showRoute && pts ? `<polyline points="${pts}" fill="none" stroke="#fff" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="${pts}" fill="none" stroke="#2563eb" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 0"/>
      <circle cx="${start[0]}" cy="${start[1]}" r="22" fill="#16a34a" stroke="#fff" stroke-width="6"/>` : ''}
      ${isTarget ? `<circle cx="${room.x}" cy="${room.y}" r="46" fill="none" stroke="#dc2626" stroke-width="10"/><circle cx="${room.x}" cy="${room.y}" r="16" fill="#dc2626" stroke="#fff" stroke-width="5"/>`
        : showRoute && end ? `<circle cx="${end[0]}" cy="${end[1]}" r="24" fill="#f59e0b" stroke="#fff" stroke-width="6"/>` : ''}
    </svg>`;
  }

  // Modal with floor tabs; showRoute=false only highlights the room (free rooms view)
  function openIndoor(room, opts) {
    const { t, esc, modal, roomName } = opts, showRoute = opts.route !== false;
    const r = showRoute ? route(room) : { floors: {}, link: null };
    const floorsToShow = showRoute ? Object.keys(r.floors).map(Number) : [room.floor];
    let cur = floorsToShow[floorsToShow.length - 1];
    const linkName = r.link ? t(r.link.kind === 'lift' ? 'link_lift' : 'link_stairs', { block: r.link.block }) : '';
    const steps = showRoute ? [t('step_enter'), ...(r.link ? [t('step_up', { link: linkName, n: room.floor })] : []), t('step_walk', { room: roomName(room) })] : [];
    modal(`<h2>${esc(roomName(room))}</h2><p class="meta">${esc(t('campus_c1'))} · ${esc(t('floor_n', { n: room.floor }))} · ${esc(t('seats_n', { n: room.capacity }))}</p>
      <div class="chips" role="tablist">${[1, 2, 3].map((f) => `<button class="chip ${f === cur ? 'on' : ''}" data-floor="${f}" role="tab" aria-selected="${f === cur}">${esc(t('floor_n', { n: f }))}${floorsToShow.includes(f) && showRoute ? ' •' : ''}</button>`).join('')}</div>
      <div class="floorwrap" id="fp"></div>
      ${steps.length ? `<ol class="steps">${steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol><p class="meta">${esc(t('route_legend'))}</p>` : ''}
      <p class="meta">${esc(t('plans_credit'))}</p>`, (root) => {
      const draw = () => { root.querySelector('#fp').innerHTML = svgFloor(cur, room, r.floors[cur], t, showRoute); root.querySelectorAll('[data-floor]').forEach((b) => { const on = Number(b.dataset.floor) === cur; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); };
      root.querySelectorAll('[data-floor]').forEach((b) => b.addEventListener('click', () => { cur = Number(b.dataset.floor); draw(); }));
      draw();
    });
  }

  // ---------- city map ----------
  let leafletReady;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise((ok, no) => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      const sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; sc.onload = ok; sc.onerror = () => no(new Error('map'));
      document.head.appendChild(sc);
    });
    return leafletReady;
  }
  const pin = (color, label) => window.L.divIcon({ className: 'cp-pin', html: `<span style="background:${color}">${label || ''}</span>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
  const km = (a, b) => { const R = 6371, dLat = (b[0] - a[0]) * Math.PI / 180, dLng = (b[1] - a[1]) * Math.PI / 180, x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); };

  // Route through the streets (OpenStreetMap routing service); straight line if it is not reachable
  async function cityRoute(from, to, mode) {
    const base = mode === 'car' ? 'https://routing.openstreetmap.de/routed-car' : 'https://routing.openstreetmap.de/routed-foot';
    try {
      const r = await fetch(`${base}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`);
      const j = await r.json(); const x = j.routes[0];
      return { line: x.geometry.coordinates.map(([lng, lat]) => [lat, lng]), km: x.distance / 1000, min: Math.round(x.duration / 60), exact: true };
    } catch { const d = km(from, to); return { line: [from, to], km: d, min: Math.round((d / (mode === 'car' ? 30 : 4.5)) * 60), exact: false }; }
  }
  return { route, openIndoor, loadLeaflet, pin, cityRoute };
})();
