const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/*************************************************
 * TABLAS
 *************************************************/
const TABLA_PARTES = "Partes x PS";
const TABLA_SP_KG = "SP Kg";
const TABLA_ENVIOS_PS = "Envios a PS";
const TABLA_ENTREGAS_PS = "Entrega a PS";

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
let entregasPSCache = null;
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

function num(n){ return Number(n || 0); }

function formatNumber(n){
  return Number(n || 0).toLocaleString("es-AR");
}

function formatDecimal(n){
  let value = Number(n || 0);

  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function formatCajones(n){
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

btnIndex.onclick = ()=>{
  window.location.href = "index.html";
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
  const { data, error } = await supabaseClient.from(TABLA_PARTES).select("PS");

  if (error){
    console.error(error);
    setStatus("Error al cargar proveedores");
    return;
  }

  listaPS = [...new Set((data || []).map(x => x.PS).filter(Boolean))].sort();

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

  const { data, error } = await supabaseClient.from(TABLA_PARTES).select("*");

  if (error){
    console.error(error);
    throw new Error("Error al leer Partes x PS");
  }

  partesCache = data || [];
  return partesCache;
}

async function cargarSPKG(){
  if(spKgCache) return spKgCache;

  const { data, error } = await supabaseClient.from(TABLA_SP_KG).select("*");

  if (error){
    console.error(error);
    throw new Error("Error al leer SP Kg");
  }

  const map = new Map();

  (data || []).forEach(r=>{
    const key = String(r.Sp || r.SP || "").trim().toLowerCase();
    if (!key) return;

    map.set(key, {
      kgUni: parseDecimal(pick(r, ["Kg x UNI", "Kg x Uni", "kg x uni", "Kg x UN", "Kg Uni"])),
      kgCaj: parseDecimal(pick(r, ["Kg Cajon", "Kg x Cajon", "kg cajon", "kg x cajon"])),
      stockInicial: parseDecimal(pick(r, [
        "Stock Inicial",
        "Stock inicial",
        "STOCK INICIAL",
        "StockInicial",
        "Stock_Inicial",
        "Stock Ini",
        "Stock"
      ]))
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

  (data || []).forEach(r=>{
    const provServ = normalizeText(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"]));
    const sectorSP = normalizeText(pick(r, ["Sector SP", "Sector_SP", "sector sp", "sector_sp"]));

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
    totalCajMap
  };

  return enviosPSCache;
}

async function cargarEntregasPS(){
  if(entregasPSCache) return entregasPSCache;

  const { data, error } = await supabaseClient
    .from(TABLA_ENTREGAS_PS)
    .select("*");

  if (error){
    console.error(error);
    throw new Error("Error al leer Entrega a PS");
  }

  const detalleMap = new Map();
  const totalKgMap = new Map();
  const totalCajMap = new Map();

  (data || []).forEach(r=>{
    const provServ = normalizeText(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"]));
    const sectorSP = normalizeText(pick(r, ["Sector SP", "Sector_SP", "sector sp", "sector_sp"]));

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

  entregasPSCache = {
    detalleMap,
    totalKgMap,
    totalCajMap
  };

  return entregasPSCache;
}

function obtenerEnviosPS(ps, sp, parte, enviosData, kgXUni){
  const key = `${normalizeText(ps)}__${normalizeText(sp)}`;

  const totalKg = Number(enviosData.totalKgMap.get(key) || 0);
  const totalCaj = Number(enviosData.totalCajMap.get(key) || 0);
  const totalUni = kgXUni > 0 ? Math.floor(totalKg / kgXUni) : 0;
  const detalleBase = enviosData.detalleMap.get(key) || [];

  const detalle = detalleBase.map(x => {
    const unidades = kgXUni > 0 ? Math.floor(Number(x.kg || 0) / kgXUni) : 0;
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

function obtenerEntregasPS(ps, sp, parte, entregasData, kgXUni){
  const key = `${normalizeText(ps)}__${normalizeText(sp)}`;

  const totalKg = Number(entregasData.totalKgMap.get(key) || 0);
  const totalCaj = Number(entregasData.totalCajMap.get(key) || 0);
  const totalUni = kgXUni > 0 ? Math.floor(totalKg / kgXUni) : 0;

  const detalleBase = entregasData.detalleMap.get(key) || [];

  const detalle = detalleBase.map(x => {
    const unidades = kgXUni > 0 ? Math.floor(Number(x.kg || 0) / kgXUni) : 0;
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

  document.querySelectorAll(".tallerista-btn").forEach(b=>{
    b.classList.toggle("active", b.textContent === ps);
  });

  let partes, spKg, enviosData, entregasData;

  try{
    [partes, spKg, enviosData, entregasData] = await Promise.all([
      cargarPartes(),
      cargarSPKG(),
      cargarEnviosPS(),
      cargarEntregasPS()
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
    const info = spKg.get(key) || { kgUni: 0, kgCaj: 0, stockInicial: 0 };

    const enviosInfo = obtenerEnviosPS(
      ps,
      item.SP || item.Sp || "",
      item.Parte || "",
      enviosData,
      info.kgUni
    );

    const entregasInfo = obtenerEntregasPS(
      ps,
      item.SP || item.Sp || "",
      item.Parte || "",
      entregasData,
      info.kgUni
    );

    const stockInicial = Number(info.stockInicial || 0);
    const totalEnv = Number(enviosInfo.totalUni || 0);
    const totalEnt = Number(entregasInfo.totalUni || 0);

    const onlineUni = stockInicial + totalEnv - totalEnt;
    const onlineKg = onlineUni * Number(info.kgUni || 0);
    const onlineCaj = Number(info.kgCaj || 0) > 0 ? (onlineKg / Number(info.kgCaj)) : 0;

    const enviar = 0;

    const popupEnviosItems = enviosInfo.detalle.length
      ? enviosInfo.detalle
          .map(x => `${x.fecha} - ${formatDecimal(x.kg)} kg - ${formatCajones(x.cajones)} caj - ${formatNumber(x.unidades)} uni`)
          .join("|")
      : "Sin envíos";

    const popupEntregasItems = entregasInfo.detalle.length
      ? entregasInfo.detalle
          .map(x => `${x.fecha} - ${formatDecimal(x.kg)} kg - ${formatCajones(x.cajones)} caj - ${formatNumber(x.unidades)} uni`)
          .join("|")
      : "Sin entregas";

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

        <td class="center">
          <div class="cell-combo">
            <span class="cell-total">${formatNumber(totalEnt)}</span>
            <button
              type="button"
              class="mini-popup-btn"
              data-popup-title="${escapeHtml(`Entregas - ${item.Parte || ""}`)}"
              data-popup-items="${escapeHtml(popupEntregasItems)}"
            >+</button>
          </div>
        </td>

        <td>${formatDecimal(info.kgUni)}</td>
        <td>${formatDecimal(info.kgCaj)}</td>
        <td>${formatNumber(stockInicial)}</td>
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
            <th colspan="3">Info</th>
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
            <th>Stock Inicial</th>
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
    </div>
  `;

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

  document.querySelectorAll(".tallerista-btn").forEach(b=>{
    b.classList.remove("active");
  });

  setStatus("Seleccioná un proveedor");
};

/*************************************************
 * INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", cargarPS);
