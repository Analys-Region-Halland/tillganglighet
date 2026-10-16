// bestallning.js — gemensam kartmodul för alla tillgänglighetsbeställningar.
// Läser data/meta.json, data/sammanfattning.json och geodata i beställningens mapp; mapgl har
// byggt baskartan (#b-karta). Inget här är specifikt för en viss beställning.

const DATA = "data/";
const KLASSER = [15, 30, 45, 60];                                   // restidsklasser i kartan
const TIDFARG = ["#00664D", "#00AB60", "#7FCB97", "#C1E8C4", "#C9CEC3"];  // ≤15 … ≤60, över 60 / ej nådd
const TATHET = [100, 500, 1500, 3000];                               // inv per km²
const TATFARG = ["#E2F6FF", "#A2D9F8", "#2DB8F6", "#0073C7", "#004990"];
const ISOBAND = ["match", ["get", "cutoff"], 15, TIDFARG[0], 30, TIDFARG[1], 45, TIDFARG[2], TIDFARG[3]];   // samma klasser som rutorna
const FS_NAMN = { TRANSIT: "Kollektivtrafik", CAR: "Bil" };
const fmt = (x, d = 0) => (x == null || Number.isNaN(x)) ? "–" :
  x.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => fmt(100 * x) + " %";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const kol = (mal, fs) => `t_${mal.replace(/-/g, "_")}_${fs}`;
const hamta = (f) => fetch(DATA + f).then((r) => { if (!r.ok) throw new Error(f); return r.json(); });

const [meta, sam, rutor, iso, malgeo, kommun, deso] = await Promise.all(
  ["meta.json", "sammanfattning.json", "rutor.geojson", "isokroner.geojson", "mal.geojson", "kommun.geojson", "deso.geojson"].map(hamta));
const malNamn = Object.fromEntries(meta.mal.map((m) => [m.id, m.namn]));
const desoPer = Object.fromEntries(deso.features.map((f) => [f.properties.desokod, f]));
const nyck = (mal, fs) => `${mal.replace(/-/g, "_")}_${fs}`;
const utbredning = (f) => { const b = [180, 90, -180, -90];
  const g = (c) => (typeof c[0] === "number" ? (b[0] = Math.min(b[0], c[0]), b[1] = Math.min(b[1], c[1]), b[2] = Math.max(b[2], c[0]), b[3] = Math.max(b[3], c[1])) : c.forEach(g));
  g(f.geometry.coordinates); return [[b[0], b[1]], [b[2], b[3]]]; };

// ── Tillstånd (sparas i adressen: #mal=…&fs=…&vy=…) ──────────────────────────────
const h = new URLSearchParams(location.hash.slice(1));
const S = {
  mal: meta.mal.some((m) => m.id === h.get("mal")) ? h.get("mal") : meta.mal[0].id,
  fs: meta.fardsatt.includes(h.get("fs")) ? h.get("fs") : meta.fardsatt[0],
  vy: ["restid", "deso", "iso", "tathet"].includes(h.get("vy")) ? h.get("vy") : "restid",
  iso: h.get("iso") !== "0",
  d3: h.get("3d") === "1",
  deso: desoPer[h.get("deso")] ? h.get("deso") : null,
};
const sparaAdress = () => history.replaceState(null, "", "#" + new URLSearchParams({
  mal: S.mal, fs: S.fs, vy: S.vy, iso: S.iso ? "1" : "0", "3d": S.d3 ? "1" : "0", ...(S.deso ? { deso: S.deso } : {}) }).toString());

const niva = (mal, fs, cu) => sam.nivaer.find((r) => r.mal === mal && r.fardsatt === fs && r.cutoff === cu);
const median = (mal, fs) => sam.median.find((r) => r.mal === mal && r.fardsatt === fs);

// ── Panelen ──────────────────────────────────────────────────────────────────
const panel = document.getElementById("b-panel");
const datum = new Date(meta.datum).toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
panel.innerHTML = `
  <div class="b-sektion">
    <a class="b-tillbaka" href="../../">← Alla tillgänglighetskörningar</a>
    <div class="b-ogon"><span>Beställning</span><span>${esc(datum)}</span>${meta.status === "utkast" ? '<span class="chip utkast">Utkast</span>' : ""}</div>
    <h1>${esc(meta.titel)}</h1>
    <p class="b-under">${esc(meta.underrubrik)}</p>
    <details class="b-fraga"><summary>Frågan som beställningen besvarar</summary><blockquote>${esc(meta.fraga)}</blockquote></details>
  </div>
  <div class="b-sektion">
    <h2 id="rubrik-fs" class="steg"><span>1</span>Välj färdsätt</h2>
    <div class="seg" role="group" aria-labelledby="rubrik-fs">
      ${meta.fardsatt.map((f) => `<button type="button" data-fs="${f}">${FS_NAMN[f]}</button>`).join("")}
    </div>
    <h2 id="rubrik-mal" class="steg"><span>2</span>Välj målpunkt <em>restid för mittersta invånaren</em></h2>
    <ul class="mal-lista" aria-labelledby="rubrik-mal">
      ${meta.mal.map((m) => `<li><button type="button" data-mal="${m.id}"><span class="prick" aria-hidden="true"></span><span>${esc(m.namn)}</span><span class="tid" data-tid="${m.id}"></span></button></li>`).join("")}
    </ul>
    <h2 id="rubrik-vy" class="steg"><span>3</span>Välj vad kartan visar</h2>
    <div class="seg seg4" role="group" aria-labelledby="rubrik-vy">
      <button type="button" data-vy="restid" title="Restid från varje bebodd ${meta.ruta} m-ruta">Bostäder</button>
      <button type="button" data-vy="deso" title="Medianrestid per DeSO-område">DeSO</button>
      <button type="button" data-vy="iso" title="Varifrån man når målet inom 15–60 min">Isokroner</button>
      <button type="button" data-vy="tathet" title="Invånare per km²">Täthet</button>
    </div>
    <div class="vaxlar">
      <label id="lbl-iso"><input type="checkbox" id="vx-iso"> Isokronlinjer ovanpå</label>
      <label id="lbl-3d"><input type="checkbox" id="vx-3d"> Befolkning i 3D</label>
    </div>
    <div class="legend" id="legend"></div>
  </div>
  <div class="b-sektion" aria-live="polite">
    <p class="svar" id="svar"></p>
    <div class="rutor4" id="rutor4"></div>
    <p class="not" id="not"></p>
  </div>
  <div class="b-sektion b-omrade" id="omrade" hidden aria-live="polite"></div>
  <div class="b-sektion">
    <h2>Alla målpunkter · andel av invånarna inom</h2>
    <div class="tabell-rull"><table class="matris" id="matris"></table></div>
    <p class="not">Klicka på en rad för att visa målpunkten i kartan.</p>
  </div>
  <div class="b-sektion">
    <h2 id="omr-rubrik">Områden (DeSO)</h2>
    <div class="tabell-rull"><table class="omr" id="omr"></table></div>
    <p class="not">Klicka på ett område för att zooma dit. DeSO är SCB:s demografiska statistikområden med 700–2 700 invånare.</p>
  </div>
  <div class="b-sektion">
    <h2>Ladda ner</h2>
    <ul class="nedladdning">
      <li><a href="ladda-ner/sammanfattning.csv" download><span>Sammanfattning per målpunkt, färdsätt och tid</span><small>csv</small></a></li>
      <li><a href="ladda-ner/deso-sammanfattning.csv" download><span>Per DeSO-område: invånare, medianrestid och andel inom varje tidsgräns</span><small>csv</small></a></li>
      <li><a href="ladda-ner/restider-rutor.csv" download><span>Restid från varje ${meta.ruta} m-ruta till varje mål</span><small>csv</small></a></li>
      <li><a href="ladda-ner/tillganglighet.gpkg" download><span>Rutor, isokroner och målpunkter för GIS</span><small>gpkg</small></a></li>
      <li><a href="data/rutor.geojson" download="rutor.geojson"><span>Rutor med restider (webbformat)</span><small>geojson</small></a></li>
    </ul>
  </div>
  <div class="b-sektion">
    <h2>Så har vi räknat</h2>
    <ul class="metod">
      <li><b>Bostäderna.</b> ${fmt(meta.befolkning)} invånare i ${esc(meta.ursprung.namn)}, fördelade på ${fmt(meta.rutor)} bebodda ${meta.ruta} m-rutor. Befolkningen är SCB:s 1 km-rutor 2025, fördelade på bostadsbyggnaderna och kalibrerade mot SCB:s DeSO-statistik. Restiden räknas från rutans befolkningsviktade mittpunkt, där folk faktiskt bor.</li>
      <li><b>Kollektivtrafik.</b> Gång till hållplats, buss och tåg till målet och gång sista biten, en vanlig tisdag (${esc(meta.analysdag)}). Siffrorna gäller ${meta.huvudpercentil === 1 ? `<b>den snabbaste resan</b> som går att planera med avresa mellan ${esc(meta.avresa)} och ${String(+meta.avresa.slice(0, 2) + meta.fonster / 60).padStart(2, "0")}:00. Man går hemifrån precis i tid till avgången och väntar inte på hållplatsen` : `percentil ${meta.huvudpercentil} av avresorna i fönstret`}. Högst ${meta.max_fordon - 1} byten och ${meta.max_gang} min gång till och från hållplats. Tidtabell: GTFS Sverige 2, ${esc(meta.gtfs)}. Den som går hemifrån en slumpvis minut får också vänta på avgången. Den restiden finns i nedladdningen.</li>
      <li><b>Bil.</b> Restid utan köer, enligt hastighetsgränser i OpenStreetMap. I rusningstrafik mot Göteborg blir verklig restid längre.</li>
      <li><b>Isokronerna</b> visar varifrån man når målet inom 15, 30, 45 och 60 minuter. De är räknade på samma sätt som bostadsrutorna, men från ett rutnät med ${meta.isokron_steg ?? 500} m mellan punkterna som också täcker obebodd mark och grannkommunerna. Tiderna är utjämnade, och små öar under 1 km² är borttagna. För kollektivtrafik blir isokronerna fläckiga runt stationerna: man når målet snabbt nära en station, men inte från marken mellan stationerna. Bilens restider är räknade från målet ut, vilket ger nästan samma resultat eftersom vägnätet är nästan symmetriskt.</li>
      <li><b>Små rutor.</b> Befolkningen per ruta är ett modellvärde. Rutor med färre än 5 invånare visas utan antal. Summor och andelar räknas på alla invånare.</li>
      <li>Beräknat ${esc(meta.beraknad)} med r5r ${esc(meta.r5r)}.</li>
    </ul>
    <p class="b-kalla">Källor: SCB (befolkning), Lantmäteriet (byggnader), Samtrafiken (GTFS), © OpenStreetMap-bidragsgivare, bakgrundskarta © CARTO.</p>
  </div>`;

// ── Kartan ───────────────────────────────────────────────────────────────────
const el = document.getElementById("b-karta");
const map = await new Promise((ok) => { const v = () => (el?.map ? ok(el.map) : setTimeout(v, 30)); v(); });
if (!map.isStyleLoaded()) await new Promise((ok) => map.once("load", ok));
const forsta = map.getStyle().layers.find((l) => l.type === "symbol")?.id;   // våra lager under ortnamnen

map.addSource("rutor", { type: "geojson", data: rutor });
map.addSource("iso", { type: "geojson", data: iso });
map.addSource("kommun", { type: "geojson", data: kommun });
map.addSource("deso", { type: "geojson", data: deso, promoteId: "desokod" });
const tidUttryck = () => ["step", ["coalesce", ["get", kol(S.mal, S.fs)], 999],
  TIDFARG[0], KLASSER[0] + .5, TIDFARG[1], KLASSER[1] + .5, TIDFARG[2], KLASSER[2] + .5, TIDFARG[3], KLASSER[3] + .5, TIDFARG[4]];
const invText = (v) => (v == null || v === "null" ? "färre än 5" : fmt(+v));
const tatUttryck = ["step", ["coalesce", ["get", "tathet"], 0], TATFARG[0], TATHET[0], TATFARG[1], TATHET[1], TATFARG[2], TATHET[2], TATFARG[3], TATHET[3], TATFARG[4]];
map.addLayer({ id: "rutor-yta", type: "fill", source: "rutor", paint: { "fill-color": tidUttryck(), "fill-opacity": .88 } }, forsta);
map.addLayer({ id: "rutor-3d", type: "fill-extrusion", source: "rutor", layout: { visibility: "none" },
  paint: { "fill-extrusion-color": tidUttryck(), "fill-extrusion-height": ["*", ["coalesce", ["get", "pop"], 2], 6], "fill-extrusion-opacity": .9 } }, forsta);
// DeSO: koroplet i vyn DeSO, annars osynlig yta som tar emot klick; gränser, hovring och valt område
const desoUttryck = () => ["step", ["coalesce", ["get", `m_${nyck(S.mal, S.fs)}`], 999],
  TIDFARG[0], KLASSER[0] + .5, TIDFARG[1], KLASSER[1] + .5, TIDFARG[2], KLASSER[2] + .5, TIDFARG[3], KLASSER[3] + .5, TIDFARG[4]];
map.addLayer({ id: "deso-yta", type: "fill", source: "deso", paint: { "fill-color": desoUttryck(), "fill-opacity": 0 } }, forsta);
map.addLayer({ id: "deso-linje", type: "line", source: "deso", paint: { "line-color": "#1B2420", "line-width": .6, "line-opacity": .35 } }, forsta);
map.addLayer({ id: "deso-hover", type: "line", source: "deso",
  paint: { "line-color": "#1B2420", "line-width": 2, "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], .9, 0] } }, forsta);
map.addLayer({ id: "deso-vald", type: "line", source: "deso", filter: ["==", ["get", "desokod"], ""],
  paint: { "line-color": "#004990", "line-width": 3.2 } }, forsta);
map.addLayer({ id: "kommun-linje", type: "line", source: "kommun", paint: { "line-color": "#1B2420", "line-width": 1.4, "line-dasharray": [3, 2] } }, forsta);
// isokroner: fyllda zoner (vyn Isokroner; 60 ritas först, 15 överst) och diskreta konturer (ovanpå bostäderna)
map.addLayer({ id: "iso-yta", type: "fill", source: "iso", layout: { "fill-sort-key": ["-", 100, ["get", "cutoff"]] },
  paint: { "fill-color": ISOBAND, "fill-opacity": .78, "fill-antialias": true } }, forsta);
map.addLayer({ id: "iso-linje", type: "line", source: "iso", layout: { "line-join": "round" },
  paint: { "line-color": "#1B2420", "line-opacity": ["match", ["get", "cutoff"], 15, .8, 30, .65, 45, .5, .4],
           "line-width": ["match", ["get", "cutoff"], 15, 1.6, 30, 1.3, 1] } }, forsta);
map.addLayer({ id: "iso-etikett", type: "symbol", source: "iso",
  layout: { "symbol-placement": "line", "text-field": ["concat", ["to-string", ["get", "cutoff"]], " min"],
            "text-font": ["Montserrat Medium"], "text-size": 11, "symbol-spacing": 420 },
  paint: { "text-color": "#1B2420", "text-halo-color": "#FFFFFF", "text-halo-width": 1.6 } });

// målpunkter som html-markörer (alltid läsbara, klickbara, inget beroende av bakgrundens typsnitt)
const markorer = {};
for (const f of malgeo.features) {
  const d = document.createElement("button");
  d.type = "button"; d.className = "mal-markor"; d.setAttribute("aria-label", "Visa " + f.properties.namn);
  d.innerHTML = `<span class="m-prick"></span><span class="m-namn">${esc(f.properties.namn)}</span>`;
  d.addEventListener("click", (e) => { e.stopPropagation(); valj({ mal: f.properties.id }); });
  markorer[f.properties.id] = new maplibregl.Marker({ element: d, anchor: "left", offset: [-8, 0] })
    .setLngLat(f.geometry.coordinates).addTo(map);
}

// klick: en ruta ger popup med restid till alla mål och väljer rutans DeSO; ett område väljs direkt
let popup = null;
map.on("click", (e) => {
  const ruta = S.vy !== "deso" && S.vy !== "iso" ? map.queryRenderedFeatures(e.point, { layers: [S.d3 ? "rutor-3d" : "rutor-yta"] })[0] : null;
  const omr = map.queryRenderedFeatures(e.point, { layers: ["deso-yta"] })[0];
  popup?.remove();
  if (ruta) {
    const p = ruta.properties;
    const rader = meta.mal.map((m) => { const t = p[kol(m.id, S.fs)];
      return `<tr class="${m.id === S.mal ? "vald" : ""}"><td>${esc(m.namn)}</td><td>${t == null || t === "null" ? `över ${meta.max_restid}` : t} min</td></tr>`; }).join("");
    popup = new maplibregl.Popup({ maxWidth: "300px" }).setLngLat(e.lngLat).setHTML(
      `<div class="popup"><h3>${invText(p.pop)} invånare${p.tathet == null || p.tathet === "null" ? "" : ` · ${fmt(+p.tathet)} inv/km²`}</h3>
       <div style="color:#4A5450;margin-bottom:6px">${meta.ruta} m-ruta · ${FS_NAMN[S.fs]}</div><table>${rader}</table></div>`).addTo(map);
    if (p.desokod) valj({ deso: p.desokod });
  } else if (omr) valj({ deso: omr.properties.desokod });
  else if (S.deso) valj({ deso: null });
});
let hoverId = null;
map.on("mousemove", "deso-yta", (e) => {
  const id = e.features[0]?.id;
  if (hoverId !== null && hoverId !== id) map.setFeatureState({ source: "deso", id: hoverId }, { hover: false });
  hoverId = id; if (id != null) map.setFeatureState({ source: "deso", id }, { hover: true });
  map.getCanvas().style.cursor = "pointer";
});
map.on("mouseleave", "deso-yta", () => {
  if (hoverId !== null) map.setFeatureState({ source: "deso", id: hoverId }, { hover: false });
  hoverId = null; map.getCanvas().style.cursor = "";
});
// tooltip vid hovring: isokronzon, ruta eller DeSO beroende på vy (pekskärm: klick ger popup i stället)
const tip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "hovertip", offset: 14, maxWidth: "270px" });
const tidText = (t) => (t == null || t === "null" ? `över ${meta.max_restid} min` : `${t} min`);
map.on("mousemove", (e) => {
  let html = null;
  const fsn = FS_NAMN[S.fs].toLowerCase(), mn = esc(malNamn[S.mal]);
  if (S.vy === "iso") {
    const z = map.queryRenderedFeatures(e.point, { layers: ["iso-yta"] });
    html = z.length ? `Härifrån når man <b>${mn}</b> inom <b>${Math.min(...z.map((f) => f.properties.cutoff))} min</b> med ${fsn}.`
                    : `Härifrån tar det mer än ${Math.max(...meta.cutoffs)} min till ${mn} med ${fsn}.`;
  } else if (S.vy === "deso") {
    const d = map.queryRenderedFeatures(e.point, { layers: ["deso-yta"] })[0];
    if (d) { const p = d.properties, m = p[`m_${nyck(S.mal, S.fs)}`];
      html = `<b>${esc(p.namn)}</b><br>${fmt(+p.pop)} invånare · hälften når ${mn} inom <b>${tidText(m)}</b><br><span class="tip-hint">Klicka för detaljer</span>`; }
  } else {
    const r = map.queryRenderedFeatures(e.point, { layers: [S.d3 ? "rutor-3d" : "rutor-yta"] })[0];
    if (r) { const p = r.properties, d = desoPer[p.desokod]?.properties;
      html = S.vy === "tathet" ? `<b>${invText(p.pop)} invånare</b> i rutan${p.tathet == null || p.tathet === "null" ? "" : ` · ${fmt(+p.tathet)} inv/km²`}${d ? `<br>${esc(d.namn)}` : ""}`
        : `<b>${tidText(p[kol(S.mal, S.fs)])}</b> till ${mn} med ${fsn}<br>${invText(p.pop)} invånare i rutan${d ? ` · ${esc(d.namn)}` : ""}<br><span class="tip-hint">Klicka för alla mål</span>`; }
  }
  if (html) tip.setLngLat(e.lngLat).setHTML(html).addTo(map); else tip.remove();
});
el.addEventListener("mouseleave", () => tip.remove());

// skylt i kartan: vad visas just nu
const skylt = document.createElement("div");
skylt.className = "kart-skylt"; skylt.setAttribute("aria-live", "polite");
el.appendChild(skylt);
const VYTEXT = { restid: "Restid från bostäderna", deso: "Medianrestid per DeSO", iso: "Isokroner, varifrån man når målet", tathet: "Befolkningstäthet" };

const zoomaTill = (kod) => { const f = desoPer[kod]; if (f) map.fitBounds(utbredning(f), { padding: 80, maxZoom: 14, duration: 700 }); };

// ── Uppdatera allt efter tillståndet ───────────────────────────────────────────
function rita() {
  const isoVy = S.vy === "iso", desoVy = S.vy === "deso", d3 = S.d3 && !isoVy && !desoVy;
  const farg = S.vy === "tathet" ? tatUttryck : tidUttryck();
  map.setPaintProperty("rutor-yta", "fill-color", farg);
  map.setPaintProperty("rutor-3d", "fill-extrusion-color", farg);
  map.setLayoutProperty("rutor-yta", "visibility", !isoVy && !desoVy && !d3 ? "visible" : "none");
  map.setPaintProperty("deso-yta", "fill-color", desoUttryck());
  map.setPaintProperty("deso-yta", "fill-opacity", desoVy ? .85 : 0);
  map.setPaintProperty("deso-linje", "line-color", desoVy ? "#FFFFFF" : "#1B2420");
  map.setPaintProperty("deso-linje", "line-opacity", desoVy ? .9 : isoVy ? 0 : .3);
  map.setPaintProperty("deso-linje", "line-width", desoVy ? 1.1 : .6);
  map.setFilter("deso-vald", ["==", ["get", "desokod"], S.deso ?? ""]);
  map.setLayoutProperty("rutor-3d", "visibility", d3 ? "visible" : "none");
  if (d3 && map.getPitch() < 30) map.easeTo({ pitch: 55, duration: 600 });
  if (!d3 && map.getPitch() > 0) map.easeTo({ pitch: 0, duration: 400 });
  const filt = ["all", ["==", ["get", "id"], S.mal], ["==", ["get", "fardsatt"], S.fs]];
  const synlig = { "iso-yta": isoVy, "iso-linje": isoVy || (S.iso && S.vy === "restid"), "iso-etikett": isoVy || (S.iso && S.vy === "restid") };
  for (const [l, v] of Object.entries(synlig)) { map.setFilter(l, filt); map.setLayoutProperty(l, "visibility", v ? "visible" : "none"); }
  skylt.innerHTML = `<div><b>${esc(VYTEXT[S.vy])}</b>${S.vy === "tathet" ? "" : ` · ${esc(malNamn[S.mal])} · ${FS_NAMN[S.fs]}`}</div>
    <span>${matchMedia("(hover: hover)").matches ? "Hovra för siffror, klicka på ett område för detaljer" : "Tryck på kartan för siffror"}</span>`;
  panel.querySelector("#lbl-iso").hidden = S.vy !== "restid";
  panel.querySelector("#lbl-3d").hidden = isoVy || desoVy;
  for (const [id, m] of Object.entries(markorer)) m.getElement().classList.toggle("vald", id === S.mal);

  panel.querySelectorAll("[data-fs]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.fs === S.fs));
  panel.querySelectorAll("[data-mal]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.mal === S.mal));
  panel.querySelectorAll("[data-vy]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.vy === S.vy));
  panel.querySelector("#vx-iso").checked = S.iso;
  panel.querySelector("#vx-3d").checked = S.d3;
  for (const m of meta.mal) panel.querySelector(`[data-tid="${m.id}"]`).textContent =
    median(m.id, S.fs)?.median != null ? `${median(m.id, S.fs).median} min` : `> ${meta.max_restid} min`;

  // svaret och nyckeltalen
  const n30 = niva(S.mal, S.fs, 30), md = median(S.mal, S.fs);
  panel.querySelector("#svar").innerHTML = md?.median != null
    ? `Hälften av invånarna i ${esc(meta.ursprung.namn)} når ${esc(malNamn[S.mal])} inom <b>${md.median} minuter</b> med ${FS_NAMN[S.fs].toLowerCase()}.`
    : `Färre än hälften av invånarna i ${esc(meta.ursprung.namn)} når ${esc(malNamn[S.mal])} inom ${meta.max_restid} minuter med ${FS_NAMN[S.fs].toLowerCase()}.`;
  panel.querySelector("#rutor4").innerHTML = meta.cutoffs.map((cu) => { const n = niva(S.mal, S.fs, cu);
    return `<div class="ruta4"><span class="lbl">inom ${cu} min</span><span class="pct">${pct(n.andel)}</span>
      <span class="inv">${fmt(n.inv)} inv</span><span class="stapel"><i style="width:${(100 * n.andel).toFixed(1)}%"></i></span></div>`; }).join("");
  const j = (sam.jamforelse || []).find((r) => r.mal === S.mal);
  panel.querySelector("#not").textContent = S.fs === "TRANSIT"
    ? (meta.huvudpercentil === 1 ? "Snabbaste resan med avresa 07–09." : "") +
      (j?.extra_median != null ? ` Den som går hemifrån en slumpvis minut får vänta på avgången, i mitten ${j.extra_median} min till${j.median_slump != null ? ` (mittersta invånaren ${j.median_slump} min)` : ""}.` : "")
    : "Restid utan köer.";

  // legend
  const tidLegend = `<div class="legend-rad">${TIDFARG.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
       <div class="legend-etik"><span>0–15</span><span>15–30</span><span>30–45</span><span>45–60</span><span>över 60</span></div>`;
  // valt område
  const om = panel.querySelector("#omrade");
  const f = S.deso && desoPer[S.deso];
  om.hidden = !f;
  if (f) {
    const p = f.properties, k = nyck(S.mal, S.fs);
    om.innerHTML = `<div class="omr-huvud"><h2>Valt område</h2><button type="button" class="rensa" data-rensa>Visa hela kommunen</button></div>
      <p class="svar" style="font-size:17px"><b style="color:var(--bla1)">${esc(p.namn)}</b> · ${fmt(p.pop)} invånare.
      ${p["m_" + k] != null ? `Hälften når ${esc(malNamn[S.mal])} inom <b>${p["m_" + k]} min</b>` : `Färre än hälften når ${esc(malNamn[S.mal])} inom ${meta.max_restid} min`} med ${FS_NAMN[S.fs].toLowerCase()}${md?.median != null ? ` (kommunen ${md.median} min)` : ""}.</p>
      <div class="rutor4">${meta.cutoffs.map((cu) => { const a = p[`a${cu}_${k}`] ?? 0, ak = niva(S.mal, S.fs, cu).andel;
        return `<div class="ruta4 omr4"><span class="lbl">inom ${cu} min</span><span class="pct">${pct(a)}</span>
          <span class="inv">kommunen ${pct(ak)}</span><span class="stapel"><i style="width:${(100 * a).toFixed(1)}%"></i><b style="left:${(100 * ak).toFixed(1)}%"></b></span></div>`; }).join("")}</div>`;
  }

  panel.querySelector("#legend").innerHTML = S.vy === "restid"
    ? `${tidLegend}<p class="not">Minuter till ${esc(malNamn[S.mal])}, ${FS_NAMN[S.fs].toLowerCase()}, från varje bebodd ${meta.ruta} m-ruta.${S.iso ? " Linjerna är isokronerna." : ""}</p>`
    : desoVy
    ? `${tidLegend}<p class="not">Restid för mittersta invånaren i varje DeSO-område till ${esc(malNamn[S.mal])}, ${FS_NAMN[S.fs].toLowerCase()}.</p>`
    : S.vy === "iso"
    ? `${tidLegend.replace(/<span style="background:#C9CEC3"><\/span>/, "").replace("<span>över 60</span>", "")}
       <p class="not">Härifrån når man ${esc(malNamn[S.mal])} inom 15, 30, 45 och 60 minuter med ${FS_NAMN[S.fs].toLowerCase()}, även där ingen bor.</p>`
    : `<div class="legend-rad">${TATFARG.map((c) => `<span style="background:${c}"></span>`).join("")}</div>
       <div class="legend-etik"><span>&lt;100</span><span>100–500</span><span>500–1 500</span><span>1 500–3 000</span><span>3 000+</span></div>
       <p class="not">Invånare per km² i varje ${meta.ruta} m-ruta.${S.d3 ? " Höjden visar antalet invånare." : ""}</p>`;

  // matris
  const m = panel.querySelector("#matris");
  const skugga = (a) => `background:rgba(0,102,77,${(0.08 + 0.72 * a).toFixed(2)});color:${a > .55 ? "#fff" : "inherit"}`;
  m.innerHTML = `<thead><tr><th>${FS_NAMN[S.fs]}</th>${meta.cutoffs.map((c) => `<th>${c} min</th>`).join("")}</tr></thead><tbody>` +
    meta.mal.map((mm) => `<tr data-rad="${mm.id}" class="${mm.id === S.mal ? "vald" : ""}"><td title="${esc(mm.namn)}">${esc(mm.namn)}</td>${
      meta.cutoffs.map((c) => { const n = niva(mm.id, S.fs, c); return `<td style="${skugga(n.andel)}">${fmt(100 * n.andel)}</td>`; }).join("")}</tr>`).join("") + "</tbody>";
  m.querySelectorAll("tr[data-rad]").forEach((tr) => tr.addEventListener("click", () => valj({ mal: tr.dataset.rad })));

  // områden (DeSO), snabbast först; klick väljer och zoomar
  const o = (sam.omraden || []).filter((r) => r.mal === S.mal && r.fardsatt === S.fs).sort((a, b) => (a.median ?? 999) - (b.median ?? 999));
  panel.querySelector("#omr-rubrik").textContent = `Områden (DeSO) · ${malNamn[S.mal]}`;
  const ot = panel.querySelector("#omr");
  ot.innerHTML = `<thead><tr><th>Område</th><th>Invånare</th><th>Median</th><th>Inom 30</th><th>Inom 60</th></tr></thead><tbody>` +
    o.map((r) => `<tr data-deso="${r.desokod}" class="${r.desokod === S.deso ? "vald" : ""}" tabindex="0"><td title="${esc(r.namn)}">${esc(r.namn)}</td><td>${fmt(r.pop)}</td><td>${r.median ?? "–"} min</td><td>${pct(r.inom30)}</td><td>${pct(r.inom60)}</td></tr>`).join("") + "</tbody>";
  ot.querySelectorAll("tr[data-deso]").forEach((tr) => {
    const g = () => { valj({ deso: tr.dataset.deso }); zoomaTill(tr.dataset.deso); };
    tr.addEventListener("click", g); tr.addEventListener("keydown", (e) => { if (e.key === "Enter") g(); });
  });
  sparaAdress();
}
function valj(ny) { Object.assign(S, ny); rita(); }

panel.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.hasAttribute("data-rensa")) { popup?.remove(); valj({ deso: null }); }
  else if (b.dataset.fs) valj({ fs: b.dataset.fs });
  else if (b.dataset.mal) valj({ mal: b.dataset.mal });
  else if (b.dataset.vy) valj({ vy: b.dataset.vy });
});
panel.querySelector("#vx-iso").addEventListener("change", (e) => valj({ iso: e.target.checked }));
panel.querySelector("#vx-3d").addEventListener("change", (e) => valj({ d3: e.target.checked }));
if (window.self !== window.top && map.cooperativeGestures) map.cooperativeGestures.enable();
rita();
