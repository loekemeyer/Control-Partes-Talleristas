const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/*************************************************
 * AJUSTAR SI TUS TABLAS/COLUMNAS SE LLAMAN DISTINTO
 *************************************************/
const TABLA_PARTES_PS = "Partes x PS";
const TABLA_ENVIOS_PS = "Envios a PS";
const TABLA_ENTREGAS_PS = "Entregas de PS";

const COL_PS = "PS";
const COL_PARTE = "Parte";
const COL_PROCESO = "Proceso";
const COL_SC = "SC";
const COL_SP = "SP";

const COL_FECHA = "Fecha";
const COL_DIA_MES = "Dia-mes";
const COL_KG = "KG";
const COL_CAJONES = "Cajones";

/*************************************************
 * DOM
 *************************************************/
const talleristasGrid = document.getElementById("talleristasGrid");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const btnVolver = document.getElementById("btnVolver");

/*************************************************
 * STATE
 *************************************************/
let partesPSCache = null;
let enviosPSCache = null;
let entregasPSCache = null;

let psActivo = "";
let listaPS = [];

/*************************************************
 * HELPERS
 *************************************************/
function setStatus(t) {
  statusEl.textContent = t || "";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString("es-AR");
}

function formatDecimal(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

function formatCajones(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      return obj[k];
    }
  }
  return undefined;
}

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  let s = String(value).trim();
  if (!s || s === "-" || s === "—") return 0;

  s = s.replace(/[^\d,.-]/g, "");

  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseFechaDDMM(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);

  if (!dd || !mm) return null;

  return { dd, mm };
}

function sortKeyFechaDDMM(value) {
  const p = parseFechaDDMM(value);
  if (!p) return 9999;
  return (p.mm * 100) + p.dd;
}

function buildParteKey(ps, parte, proceso, sc, sp) {
  return [
    normalizeText(ps),
    normalizeText(parte),
    normalizeText(proceso),
    normalizeText(sc),
    normalizeText(sp)
  ].join("__");
}

/*************************************************
 * RENDER PS
 *************************************************/
function renderPS(lista) {
  talleristasGrid.innerHTML = "";

  lista.forEach(nombre => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tallerista-btn";
    btn.textContent = nombre;

    if (nombre === psActivo) {
      btn.classList.add("active");
    }

    btn.addEventListener("click", () => seleccionarPS(nombre));
    talleristasGrid.appendChild(btn);
  });
}

function seleccionarPS(nombre) {
  psActivo = nombre;
  renderPS([nombre]);
  btnVolver.classList.remove("hidden");
  buscar(nombre);
}

function volverALista() {
  psActivo = "";
  resultEl.innerHTML = "";
  setStatus("Seleccioná un proveedor");
  btnVolver.classList.add("hidden");
  renderPS(listaPS);
}

btnVolver.addEventListener("click", volverALista);

/*************************************************
 * CARGA LISTA PS
 *************************************************/
async function cargarPS() {
  setStatus("Cargando proveedores...");
  resultEl.innerHTML = "";

  const { data, error } = await supabaseClient
    .from(TABLA_PARTES_PS)
    .select(COL_PS)
    .limit(5000);

  if (error) {
    console.error(error);
    setStatus("Error al cargar proveedores: " + (error.message || "sin detalle"));
    return;
  }

  listaPS = [...new Set(
    (data || [])
      .map(r => String(r[COL_PS] || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "es"));

  renderPS(listaPS);
  setStatus(listaPS.length ? "Seleccioná un proveedor" : "No se encontraron proveedores");
}

/*************************************************
 * CARGA PARTES PS
 *************************************************/
async function cargarPartesPS() {
  if (partesPSCache) return partesPSCache;

  const { data, error } = await supabaseClient
    .from(TABLA_PARTES_PS)
    .select("*")
    .limit(20000);

  if (error) {
    console.error(error);
    throw new Error("Error al leer " + TABLA_PARTES_PS);
  }

  const partes = [];
  const seen = new Set();

  (data || []).forEach(r => {
    const ps = String(pick(r, [COL_PS, "ps"]) || "").trim();
    const parte = String(pick(r, [COL_PARTE, "parte"]) || "").trim();
    const proceso = String(pick(r, [COL_PROCESO, "proceso"]) || "").trim();
    const sc = String(pick(r, [COL_SC, "sc"]) || "").trim();
    const sp = String(pick(r, [COL_SP, "sp"]) || "").trim();

    if (!ps || !parte) return;

    const key = buildParteKey(ps, parte, proceso, sc, sp);
    if (seen.has(key)) return;
    seen.add(key);

    partes.push({ ps, parte, proceso, sc, sp, key });
  });

  partesPSCache = partes;
  return partesPSCache;
}

/*************************************************
 * CARGA ENVIOS PS
 *************************************************/
async function cargarEnviosPS() {
  if (enviosPSCache) return enviosPSCache;

  const { data, error } = await supabaseClient
    .from(TABLA_ENVIOS_PS)
    .select("*")
    .limit(20000);

  if (error) {
    console.error(error);
    throw new Error("Error al leer " + TABLA_ENVIOS_PS);
  }

  const totalKgMap = new Map();
  const totalCajMap = new Map();
  const detalleMap = new Map();

  (data || []).forEach(r => {
    const ps = String(pick(r, [COL_PS, "ps"]) || "").trim();
    const parte = String(pick(r, [COL_PARTE, "parte"]) || "").trim();
    const proceso = String(pick(r, [COL_PROCESO, "proceso"]) || "").trim();
    const sc = String(pick(r, [COL_SC, "sc"]) || "").trim();
    const sp = String(pick(r, [COL_SP, "sp"]) || "").trim();

    const fecha = String(
      pick(r, [COL_DIA_MES, COL_FECHA, "dia-mes", "fecha"]) || ""
    ).trim();

    const kg = parseDecimal(pick(r, [COL_KG, "kg", "Kg"]));
    const cajones = parseDecimal(pick(r, [COL_CAJONES, "cajones", "Caj", "caj"]));

    if (!ps || !parte) return;
    if (!kg && !cajones) return;

    const key = buildParteKey(ps, parte, proceso, sc, sp);

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({
      fecha,
      kg,
      cajones
    });

    totalKgMap.set(key, (totalKgMap.get(key) || 0) + kg);
    totalCajMap.set(key, (totalCajMap.get(key) || 0) + cajones);
  });

  for (const [key, arr] of detalleMap.entries()) {
    arr.sort((a, b) => sortKeyFechaDDMM(a.fecha) - sortKeyFechaDDMM(b.fecha));
    detalleMap.set(key, arr);
  }

  enviosPSCache = {
    totalKgMap,
    totalCajMap,
    detalleMap
  };

  return enviosPSCache;
}

/*************************************************
 * CARGA ENTREGAS PS
 *************************************************/
async function cargarEntregasPS() {
  if (entregasPSCache) return entregasPSCache;

  const { data, error } = await supabaseClient
    .from(TABLA_ENTREGAS_PS)
    .select("*")
    .limit(20000);

  if (error) {
    console.error(error);
    throw new Error("Error al leer " + TABLA_ENTREGAS_PS);
  }

  const totalKgMap = new Map();
  const totalCajMap = new Map();
  const detalleMap = new Map();

  (data || []).forEach(r => {
    const ps = String(pick(r, [COL_PS, "ps"]) || "").trim();
    const parte = String(pick(r, [COL_PARTE, "parte"]) || "").trim();
    const proceso = String(pick(r, [COL_PROCESO, "proceso"]) || "").trim();
    const sc = String(pick(r, [COL_SC, "sc"]) || "").trim();
    const sp = String(pick(r, [COL_SP, "sp"]) || "").trim();

    const fecha = String(
      pick(r, [COL_DIA_MES, COL_FECHA, "dia-mes", "fecha"]) || ""
    ).trim();

    const kg = parseDecimal(pick(r, [COL_KG, "kg", "Kg"]));
    const cajones = parseDecimal(pick(r, [COL_CAJONES, "cajones", "Caj", "caj"]));

    if (!ps || !parte) return;
    if (!kg && !cajones) return;

    const key = buildParteKey(ps, parte, proceso, sc, sp);

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({
      fecha,
      kg,
      cajones
    });

    totalKgMap.set(key, (totalKgMap.get(key) || 0) + kg);
    totalCajMap.set(key, (totalCajMap.get(key) || 0) + cajones);
  });

  for (const [key, arr] of detalleMap.entries()) {
    arr.sort((a, b) => sortKeyFechaDDMM(a.fecha) - sortKeyFechaDDMM(b.fecha));
    detalleMap.set(key, arr);
  }

  entregasPSCache = {
    totalKgMap,
    totalCajMap,
    detalleMap
  };

  return entregasPSCache;
}

/*************************************************
 * HELPERS MOVIMIENTOS
 *************************************************/
function obtenerEnviosPS(item, enviosData) {
  const key = item.key;

  return {
    totalKg: Number(enviosData.totalKgMap.get(key) || 0),
    totalCaj: Number(enviosData.totalCajMap.get(key) || 0),
    detalle: enviosData.detalleMap.get(key) || []
  };
}

function obtenerEntregasPS(item, entregasData) {
  const key = item.key;

  return {
    totalKg: Number(entregasData.totalKgMap.get(key) || 0),
    totalCaj: Number(entregasData.totalCajMap.get(key) || 0),
    detalle: entregasData.detalleMap.get(key) || []
  };
}

/*************************************************
 * BUSQUEDA PRINCIPAL
 *************************************************/
async function buscar(nombreParam) {
  const nombre = String(nombreParam || "").trim();

  if (!nombre) {
    setStatus("Seleccioná un proveedor");
    return;
  }

  resultEl.innerHTML = "";
  setStatus("Buscando...");

  let partesPS, enviosData, entregasData;

  try {
    [partesPS, enviosData, entregasData] = await Promise.all([
      cargarPartesPS(),
      cargarEnviosPS(),
      cargarEntregasPS()
    ]);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Error al cargar datos");
    return;
  }

  const filasPS = partesPS
    .filter(x => x.ps === nombre)
    .sort((a, b) => {
      const pa = String(a.proceso || "");
      const pb = String(b.proceso || "");
      if (pa !== pb) return pa.localeCompare(pb, "es");
      return String(a.parte || "").localeCompare(String(b.parte || ""), "es");
    });

  if (!filasPS.length) {
    setStatus("No encontré resultados");
    return;
  }

  let rows = "";

  filasPS.forEach(item => {
    const enviosInfo = obtenerEnviosPS(item, enviosData);
    const entregasInfo = obtenerEntregasPS(item, entregasData);

    const saldoKg = enviosInfo.totalKg - entregasInfo.totalKg;
    const saldoCaj = enviosInfo.totalCaj - entregasInfo.totalCaj;

    const popupEnviosItems = enviosInfo.detalle.length
      ? enviosInfo.detalle
          .map(x => `${x.fecha || "-"} - ${formatDecimal(x.kg)} kg - ${formatCajones(x.cajones)} caj`)
          .join("|")
      : "Sin envíos";

    const popupEntregasItems = entregasInfo.detalle.length
      ? entregasInfo.detalle
          .map(x => `${x.fecha || "-"} - ${formatDecimal(x.kg)} kg - ${formatCajones(x.cajones)} caj`)
          .join("|")
      : "Sin entregas";

    rows += `
      <tr>
        <td>${item.proceso ? escapeHtml(item.proceso) : '<span class="zero">Sin proceso</span>'}</td>
        <td>${escapeHtml(item.parte)}</td>

        <td class="center">${item.sc ? escapeHtml(item.sc) : '<span class="zero">-</span>'}</td>
        <td class="center">${item.sp ? escapeHtml(item.sp) : '<span class="zero">-</span>'}</td>

        <td class="right"><b>${escapeHtml(formatDecimal(enviosInfo.totalKg))}</b></td>
        <td class="right"><b>${escapeHtml(formatCajones(enviosInfo.totalCaj))}</b></td>

        <td class="right"><b>${escapeHtml(formatDecimal(entregasInfo.totalKg))}</b></td>
        <td class="right"><b>${escapeHtml(formatCajones(entregasInfo.totalCaj))}</b></td>

        <td class="right"><b>${escapeHtml(formatDecimal(saldoKg))}</b></td>
        <td class="right"><b>${escapeHtml(formatCajones(saldoCaj))}</b></td>

        <td class="center">
          <div class="cell-combo">
            <span class="cell-total">${escapeHtml(formatNumber(enviosInfo.detalle.length))}</span>
            <button
              type="button"
              class="mini-popup-btn"
              data-popup-title="${escapeHtml(`Envíos - ${item.parte}`)}"
              data-popup-items="${escapeHtml(popupEnviosItems)}"
            >+</button>
          </div>
        </td>

        <td class="center">
          <div class="cell-combo">
            <span class="cell-total">${escapeHtml(formatNumber(entregasInfo.detalle.length))}</span>
            <button
              type="button"
              class="mini-popup-btn"
              data-popup-title="${escapeHtml(`Entregas - ${item.parte}`)}"
              data-popup-items="${escapeHtml(popupEntregasItems)}"
            >+</button>
          </div>
        </td>
      </tr>
    `;
  });

  setStatus(`Encontradas ${filasPS.length} partes`);

  resultEl.innerHTML = `
    <div class="articulo">
      <div class="articulo-header">${escapeHtml(nombre)}</div>
      <table class="table">
        <thead>
          <tr>
            <th colspan="4">Base</th>
            <th colspan="2" class="right">Enviado</th>
            <th colspan="2" class="right">Entregado</th>
            <th colspan="2" class="right">Saldo</th>
            <th colspan="2" class="center">Detalle</th>
          </tr>
          <tr>
            <th>Proceso</th>
            <th>Parte</th>
            <th>SC</th>
            <th>SP</th>

            <th class="right">Kg</th>
            <th class="right">Caj</th>

            <th class="right">Kg</th>
            <th class="right">Caj</th>

            <th class="right">Kg</th>
            <th class="right">Caj</th>

            <th class="center">Envíos</th>
            <th class="center">Entregas</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
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
    if (e.target === popupOverlay) {
      popupOverlay.classList.add("hidden");
    }
  });
}

/*************************************************
 * INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  cargarPS();
});
