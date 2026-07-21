// CesiumSlate renderer — mounts an interactive CesiumJS globe with LIVE satellites for a `CesiumGlobe`
// output value. Registered as a `slateRegisterWidget` component (CesiumJS owns a WebGL canvas, so it uses
// the low-level self-owned-DOM hook rather than a Preact component). Slate calls `wire(el, api)` when the
// value renders; `api.params` is the descriptor's props (the config from `cesium_globe(...)`).
//
// CesiumJS + satellite.js load from a CDN (a future `provide_assets!` can vendor them for offline/export).
(() => {
  const CESIUM_VERSION = "1.121";
  const BASE = `https://cdn.jsdelivr.net/npm/cesium@${CESIUM_VERSION}/Build/Cesium/`;

  // Load CesiumJS (+ its CSS) and satellite.js once, shared across every globe on the page.
  let _libs;
  const loadLibs = () => (_libs ??= (async () => {
    window.CESIUM_BASE_URL = BASE;                              // where Cesium finds its Web Workers + assets
    if (!document.getElementById("cesium-css")) {
      const link = document.createElement("link");
      link.id = "cesium-css"; link.rel = "stylesheet"; link.href = BASE + "Widgets/widgets.css";
      document.head.appendChild(link);
    }
    const Cesium = await import(BASE + "index.js");
    const satMod = await import("https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/+esm");
    return { Cesium, satellite: satMod.default || satMod };
  })());

  // Token-free base imagery — no Cesium Ion account needed.
  const imageryProvider = (Cesium, name) =>
    name === "osm"
      ? new Cesium.OpenStreetMapImageryProvider({ url: "https://tile.openstreetmap.org/" })
      : new Cesium.UrlTemplateImageryProvider({                 // "dark": CARTO dark basemap — a sleek space look
          url: "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
          credit: "© OpenStreetMap · © CARTO", maximumLevel: 18,
        });

  async function mount(el, props) {
    const { Cesium, satellite } = await loadLibs();
    el.innerHTML = "";
    const globe = document.createElement("div");
    globe.style.cssText =
      `width:100%;height:${props.height || 540}px;border-radius:10px;overflow:hidden;background:#04060d`;
    const status = document.createElement("div");
    status.style.cssText = "font:12px ui-monospace,monospace;color:#8a93b0;padding:5px 2px";
    status.textContent = "loading Cesium…";
    el.append(globe, status);
    const say = m => { status.textContent = m; };

    const viewer = new Cesium.Viewer(globe, {
      baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
      navigationHelpButton: false, infoBox: false, selectionIndicator: false,
      baseLayer: new Cesium.ImageryLayer(imageryProvider(Cesium, props.imagery)),
    });
    el._cesiumViewer = viewer;
    viewer.scene.globe.enableLighting = true;                  // day/night terminator
    if (viewer._cesiumWidget) viewer._cesiumWidget.creditContainer.style.display = "none";

    // Live orbital elements from Celestrak (CORS-enabled), one TLE group.
    const group = props.satellites || "visual";
    say(`fetching live satellites (${group})…`);
    const url = `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
    const lines = (await (await fetch(url)).text()).split(/\r?\n/).filter(x => x.trim().length);
    const sats = [];
    for (let i = 0; i + 2 < lines.length; i += 3) {
      const [name, l1, l2] = [lines[i].trim(), lines[i + 1], lines[i + 2]];
      if (!l1.startsWith("1 ") || !l2.startsWith("2 ")) { i -= 2; continue; }
      try { sats.push({ name, rec: satellite.twoline2satrec(l1, l2) }); } catch (e) {}
    }
    const use = sats.slice(0, props.max || 140);
    say(`propagating ${use.length} satellites…`);

    // Sample each orbit over the window into a time-dynamic position; Cesium's clock animates it.
    const SPAN = props.spanSec || 6000, STEP = 30;
    const start = Cesium.JulianDate.now();
    const stop = Cesium.JulianDate.addSeconds(start, SPAN, new Cesium.JulianDate());
    Object.assign(viewer.clock, {
      startTime: start.clone(), stopTime: stop.clone(), currentTime: start.clone(),
      clockRange: Cesium.ClockRange.LOOP_STOP, multiplier: 40, shouldAnimate: true,
    });
    if (viewer.timeline) viewer.timeline.zoomTo(start, stop);

    let n = 0;
    for (const s of use) {
      const position = new Cesium.SampledPositionProperty();
      let ok = false;
      for (let t = 0; t <= SPAN; t += STEP) {
        const when = Cesium.JulianDate.addSeconds(start, t, new Cesium.JulianDate());
        const date = Cesium.JulianDate.toDate(when);
        const pv = satellite.propagate(s.rec, date);
        if (!pv || !pv.position) continue;
        const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
        const lon = satellite.degreesLong(gd.longitude);
        const lat = satellite.degreesLat(gd.latitude);
        const alt = gd.height * 1000;
        if (![lon, lat, alt].every(Number.isFinite)) continue;
        position.addSample(when, Cesium.Cartesian3.fromDegrees(lon, lat, alt));
        ok = true;
      }
      if (!ok) continue;
      viewer.entities.add({
        name: s.name, position,
        point: { pixelSize: 5, color: Cesium.Color.CYAN, outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
        path: { resolution: 120, width: 1, leadTime: 2400, trailTime: 500,
                material: new Cesium.PolylineGlowMaterialProperty({ glowPower: 0.25, color: Cesium.Color.CYAN.withAlpha(0.4) }) },
      });
      n++;
    }
    say(`${n} live satellites orbiting — drag to rotate · scroll to zoom · click a satellite for its name`);
  }

  if (window.slateRegisterWidget) {
    window.slateRegisterWidget("CesiumSlate.CesiumGlobe", {
      wire(el, api) {
        mount(el, (api && api.params) || {}).catch(e => {
          el.textContent = "Cesium error: " + ((e && e.message) || e);
          console.error(e);
        });
      },
      destroy(el) { if (el._cesiumViewer) { try { el._cesiumViewer.destroy(); } catch (e) {} el._cesiumViewer = null; } },
    });
  }
})();
