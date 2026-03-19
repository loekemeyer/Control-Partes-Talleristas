const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/*************************************************
 * TABLAS
 *************************************************/
const TABLA_PARTES = "Partes x PS";
const TABLA_SP_KG = "SP Kg";
const TABLA_ENVIOS_PS = "Envios a PS";
/*************************************************
 * DOM
 *************************************************/
const grid = document.getElementById("talleristasGrid");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const btnVolver = document.getElementById("btnVolver");
const btnIndex = document.getElementById("btnIndex");
/*************************************************
 * STATE
 *************************************************/
let partesCache = null;
let spKgCache = null;
let enviosPSCache = null;
let listaPS = [];
let psActivo = "";

/*************************************************
 * HELPERS
 *************************************************/
function setStatus(t){ statusEl.textContent = t || ""; }

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function pick(o,k){
  for(const key of k){
    if(o && key in o) return o[key];
  }
  return "";
}

function num(n){ return Number(n||0); }
function formatNumber(n){
  return Number(n || 0).toLocaleString("es-AR");
}

function formatDecimal(n){
  let num = Number(n || 0);

  let s = String(num);

  if (!s.includes(".")) return s;

  let [int, dec] = s.split(".");
  dec = dec.slice(0, 3);

  return dec ? `${int},${dec}` : int;
}

function formatCajones(n){
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}
btnIndex.onclick = ()=>{
  window.location.href = "/";
};
function normalizeText(value){
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseDecimal(value){
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number"){
    return Number.isFinite(value) ? value : 0;
  }

  let s = String(value).trim();
  if (!s || s === "-" || s === "—") return 0;

  s = s.replace(/[^\d,.-]/g, "");

  if (s.includes(",") && !s.includes(".")){
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/*************************************************
 * CARGA LISTA PS
 *************************************************/
async function cargarPS(){
  const { data } = await supabaseClient.from(TABLA_PARTES).select("PS");

  listaPS = [...new Set(data.map(x => x.PS).filter(Boolean))].sort();

  grid.innerHTML = "";
  listaPS.forEach(ps=>{
    const b = document.createElement("button");
    b.className = "tallerista-btn";
    b.textContent = ps;
    b.onclick = ()=>seleccionar(ps);
    grid.appendChild(b);
  });

  setStatus("Seleccioná un proveedor");
}

/*************************************************
 * CACHE
 *************************************************/
async function cargarPartes(){
  if(partesCache) return partesCache;

  const { data } = await supabaseClient.from(TABLA_PARTES).select("*");

  partesCache = data;
  return data;
}

async function cargarSPKG(){
  if(spKgCache) return spKgCache;

  const { data } = await supabaseClient.from(TABLA_SP_KG).select("*");
  
  const map = new Map();

  data.forEach(r=>{   
    const key = String(r.Sp || "").trim().toLowerCase();
    if (!key) return;
  
    map.set(key,{
      kgUni: num(r["Kg x UNI"]),
      kgCaj: num(r["Kg Cajon"])
    });
  });

  spKgCache = map;
  return map;
}
async function cargarEnviosPS(){
  if(enviosPSCache) return enviosPSCache;

  const { data, error } = await supabaseClient
    .from(TABLA_ENVIOS_PS)
    .select("*");

  if (error){
    console.error(error);
    throw new Error("Error al leer Envios a PS");
  }

  const detalleMap = new Map();
  const totalKgMap = new Map();
  const totalCajMap = new Map();
  const totalUniMap = new Map();

  (data || []).forEach(r=>{
    const provServ = normalizeText(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"]));
    const sectorSP = normalizeText(pick(r, ["Sector SP", "Sector_SP", "sector sp", "sector_sp"]));
    const parte = normalizeText(pick(r, ["Parte", "parte"]));

    const fecha = String(pick(r, ["Dia-mes", "Dia_mes", "dia-mes", "dia_mes"]) || "").trim();
    const kg = parseDecimal(pick(r, ["KG", "Kg", "kg"]));
    const cajones = parseDecimal(pick(r, ["Cajones", "cajones", "CAJONES"]));

    if (!provServ || !sectorSP) return;
    if (!kg && !cajones) return;

    const key = `${provServ}__${sectorSP}`;

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({ fecha, kg, cajones });

    totalKgMap.set(key, (totalKgMap.get(key) || 0) + kg);
    totalCajMap.set(key, (totalCajMap.get(key) || 0) + cajones);
  });

  enviosPSCache = {
    detalleMap,
    totalKgMap,
    totalCajMap,
    totalUniMap
  };

  return enviosPSCache;
}

function obtenerEnviosPS(ps, sp, parte, enviosData, kgXUni){
  const key = `${normalizeText(ps)}__${normalizeText(sp)}`;

  const totalKg = Number(enviosData.totalKgMap.get(key) || 0);
  const totalCaj = Number(enviosData.totalCajMap.get(key) || 0);
  const totalUni = kgXUni > 0 ? Math.round(totalKg / kgXUni) : 0;

  const detalleBase = enviosData.detalleMap.get(key) || [];

  const detalle = detalleBase.map(x => {
    const unidades = kgXUni > 0 ? Math.round(Number(x.kg || 0) / kgXUni) : 0;
    return {
      fecha: x.fecha,
      kg: x.kg,
      cajones: x.cajones,
      unidades
    };
  });

  return {
    totalKg,
    totalCaj,
    totalUni,
    detalle
  };
}
/*************************************************
 * SELECCION
 *************************************************/
async function seleccionar(ps){
  psActivo = ps;
  btnVolver.classList.remove("hidden");

  let partes, spKg, enviosData;

  try{
    [partes, spKg, enviosData] = await Promise.all([
      cargarPartes(),
      cargarSPKG(),
      cargarEnviosPS()
    ]);
  }catch(err){
    console.error(err);
    setStatus(err.message || "Error al cargar datos");
    return;
  }

  const filas = partes.filter(x => x.PS === ps);

  let rows = "";

  filas.forEach(item=>{
    const key = String(item.SP || item.Sp || "").trim().toLowerCase();
    const info = spKg.get(key) || { kgUni: 0, kgCaj: 0 };

    const enviosInfo = obtenerEnviosPS(
      ps,
      item.SP || item.Sp || "",
      item.Parte || "",
      enviosData,
      info.kgUni
    );

    const onlineKg = 0;
    const onlineCaj = 0;
    const onlineUni = 0;
    const enviar = 0;
    const totalEnv = enviosInfo.totalUni;

    const popupEnviosItems = enviosInfo.detalle.length
      ? enviosInfo.detalle
          .map(x => `${x.fecha} - ${formatDecimal(x.kg)} kg - ${formatCajones(x.cajones)} caj - ${formatNumber(x.unidades)} uni`)
          .join("|")
      : "Sin envíos";

    rows += `
    <tr>
      <td>${escapeHtml(item.SC)}</td>
      <td>${escapeHtml(item.SP)}</td>
      <td>${escapeHtml(item.Parte)}</td>

      <td>${formatDecimal(onlineKg)}</td>
      <td>${formatCajones(onlineCaj)}</td>
      <td>${formatNumber(onlineUni)}</td>

      <td>${formatCajones(enviar)}</td>

      <td class="center">
        <div class="cell-combo">
          <span class="cell-total">${formatNumber(totalEnv)}</span>
          <button
            type="button"
            class="mini-popup-btn"
            data-popup-title="${escapeHtml(`Envíos - ${item.Parte || ""}`)}"
            data-popup-items="${escapeHtml(popupEnviosItems)}"
          >+</button>
        </div>
      </td>

      <td>${formatNumber(0)}</td>

      <td>${formatDecimal(info.kgUni)}</td>
      <td>${formatDecimal(info.kgCaj)}</td>
    </tr>`;
  });

  resultEl.innerHTML = `
  <div class="articulo">
    <div class="articulo-header">${ps}</div>

    <table class="table">
      <thead>
        <tr>
          <th colspan="3">Base</th>
          <th colspan="3">Online</th>
          <th>Enviar</th>
          <th colspan="2">Movimientos Uni</th>
          <th colspan="2">Info</th>
        </tr>
        <tr>
          <th>SC</th>
          <th>SP</th>
          <th>Descripción</th>

          <th>Kg</th>
          <th>Caj</th>
          <th>Uni</th>

          <th>Cjn</th>

          <th>Env</th>
          <th>Ent</th>

          <th>Kg x Uni</th>
          <th>Kg x Caj</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>

  <div id="popupOverlay" class="popup-overlay hidden">
    <div class="popup-box">
      <div class="popup-head">
        <div id="popupTitle" class="popup-title"></div>
        <button id="popupClose" type="button" class="popup-close">✕</button>
      </div>
      <div id="popupBody" class="popup-body"></div>
    </div>
  </div>`;
  
  const popupOverlay = document.getElementById("popupOverlay");
  const popupTitle = document.getElementById("popupTitle");
  const popupBody = document.getElementById("popupBody");
  const popupClose = document.getElementById("popupClose");

  resultEl.querySelectorAll(".mini-popup-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const title = btn.dataset.popupTitle || "";
      const items = String(btn.dataset.popupItems || "").split("|");

      popupTitle.textContent = title;
      popupBody.innerHTML = items
        .map(x => `<div class="popup-line">${escapeHtml(x)}</div>`)
        .join("");

      popupOverlay.classList.remove("hidden");
    });
  });

  popupClose.addEventListener("click", () => {
    popupOverlay.classList.add("hidden");
  });

  popupOverlay.addEventListener("click", e => {
    if (e.target === popupOverlay){
      popupOverlay.classList.add("hidden");
    }
  });

  setStatus(`Encontradas ${filas.length} filas`);
}

/*************************************************
 * VOLVER
 *************************************************/
btnVolver.onclick = ()=>{
  psActivo = "";
  resultEl.innerHTML = "";
  btnVolver.classList.add("hidden");
};

/*************************************************
 * INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", cargarPS);
