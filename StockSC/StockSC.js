"use strict";
alert("JS cargado: " + new Date().toISOString());

/* =========================================================
   BLOQUE: CONFIG SUPABASE
========================================================= */
const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyeGZjdHpuY2l4eHFtcGZoc2t2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQyNjEsImV4cCI6MjA4ODMwMDI2MX0.4L6wguch8UZGhC2VpzrWcCjJGUV-IkYsl9JoCWrOLUs";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* =========================================================
   BLOQUE: DOM
========================================================= */
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

/* =========================================================
   BLOQUE: HELPERS
========================================================= */
function setStatus(t) {
  statusEl.textContent = t || "";
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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

function formatNumber(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });
}

function formatDecimal(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatCajones(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function sortKeyFechaDDMM(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return 9999;
  return Number(m[2]) * 100 + Number(m[1]);
}

/* =========================================================
   BLOQUE: CARGA DE DATOS
========================================================= */
async function cargarBaseSCKg() {
  const { data, error } = await supabaseClient
    .from("SC Kg")
    .select(`
      "Descripcion",
      "SC",
      "Max Caj Cerv",
      "N Fleje",
      "Kg X Uni",
      "Pieza Madre",
      "Stock Inicial"
    `)
    .order("SC", { ascending: true });

  if (error) {
    console.error("ERROR SC Kg:", error);
    throw new Error(error.message || "Error al leer SC Kg");
  }

  return data || [];
}

async function cargarEnviosPS() {
  const { data, error } = await supabaseClient
    .from("Envios a PS")
    .select(`
      "Dia-mes",
      "Sector SC",
      "Cajones",
      "KG"
    `)
    .limit(20000);

  if (error) {
    console.error("ERROR Envios a PS:", error);
    throw new Error(error.message || "Error al leer Envios a PS");
  }

  return data || [];
}

/* =========================================================
   BLOQUE: MAPA DE ENVIOS PS POR SECTOR
========================================================= */
function armarMapaEnviosPS(rows) {
  const totalMap = new Map();
  const detalleMap = new Map();

  rows.forEach((r) => {
    const sector = normalizeText(r["Sector SC"]);
    const cajones = parseDecimal(r["Cajones"]);
    const kg = parseDecimal(r["KG"]);
    const fecha = String(r["Dia-mes"] || "").trim();

    if (!sector) return;
    if (!cajones && !kg) return;

    const key = sector;

    totalMap.set(key, (totalMap.get(key) || 0) + cajones);

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({ fecha, cajones, kg });
  });

  for (const [key, arr] of detalleMap.entries()) {
    arr.sort((a, b) => sortKeyFechaDDMM(a.fecha) - sortKeyFechaDDMM(b.fecha));
    detalleMap.set(key, arr);
  }

  return { totalMap, detalleMap };
}

/* =========================================================
   BLOQUE: POPUP
========================================================= */
function detalleToPopup(detalle, etiqueta) {
  if (!detalle.length) return `Sin ${etiqueta}`;

  return detalle
    .map((x) => {
      const kgTxt = x.kg ? ` - ${formatDecimal(x.kg)} kg` : "";
      return `${x.fecha || "Sin fecha"}${kgTxt} - ${formatCajones(x.cajones)} caj`;
    })
    .join("|");
}

/* =========================================================
   BLOQUE: RENDER
========================================================= */
function renderTabla(scRows, enviosPSData) {
  let rows = "";

  scRows.forEach((r) => {
    const sector = String(r["SC"] || "").trim();
    const descripcion = String(r["Descripcion"] || "").trim();

    const key = normalizeText(sector);

    const stockInicial = parseDecimal(r["Stock Inicial"]);
    const kgXUni = parseDecimal(r["Kg X Uni"]);
    const maxCajCerv = parseDecimal(r["Max Caj Cerv"]);
    const nFleje = String(r["N Fleje"] || "").trim();
    const piezaMadre = String(r["Pieza Madre"] || "").trim();

    // Esta columna conflictiva se deja en 0 por ahora
    const kgMatParte = 0;

    /* =========================================================
       BLOQUE: FABRICACIÓN
       Hardcodeado en 0 por ahora
    ========================================================= */
    const fabricacionCaj = 0;

    /* =========================================================
       BLOQUE: ENVIOS PS
       Busca por sector SC
    ========================================================= */
    const enviosPSCaj = Number(enviosPSData.totalMap.get(key) || 0);

    /* =========================================================
       BLOQUE: FORMULA ONLINE UNI
       Uni = Stock Inicial + Fabricación - Envios PS
    ========================================================= */
    const onlineUni = stockInicial + fabricacionCaj - enviosPSCaj;

    /* =========================================================
       BLOQUE: DERIVADOS VISUALES
    ========================================================= */
    const onlineCaj = onlineUni;
    const onlineKg = onlineUni * kgXUni;

    const detalleEnviosPS = enviosPSData.detalleMap.get(key) || [];
    const popupFabricacion = "Sin fabricación";
    const popupEnviosPS = detalleToPopup(detalleEnviosPS, "envíos PS");

    rows += `
      <tr>
        <td>${escapeHtml(sector)}</td>
        <td>${escapeHtml(descripcion)}</td>

        <td class="right"><b>${escapeHtml(formatDecimal(onlineKg))}</b></td>
        <td class="right"><b>${escapeHtml(formatCajones(onlineCaj))}</b></td>
        <td class="right"><b>${escapeHtml(formatNumber(onlineUni))}</b></td>

        <td class="center">
          <div class="cell-combo">
            <span class="cell-total">${escapeHtml(formatCajones(fabricacionCaj))}</span>
            <button
              type="button"
              class="mini-popup-btn"
              data-popup-title="${escapeHtml(`Fabricación - ${descripcion}`)}"
              data-popup-items="${escapeHtml(popupFabricacion)}"
            >+</button>
          </div>
        </td>

        <td class="center">
          <div class="cell-combo">
            <span class="cell-total">${escapeHtml(formatCajones(enviosPSCaj))}</span>
            <button
              type="button"
              class="mini-popup-btn"
              data-popup-title="${escapeHtml(`Envios PS - ${descripcion}`)}"
              data-popup-items="${escapeHtml(popupEnviosPS)}"
            >+</button>
          </div>
        </td>

        <td class="right"><b>${escapeHtml(formatDecimal(stockInicial))}</b></td>
        <td class="right"><b>${escapeHtml(formatDecimal(kgXUni))}</b></td>
        <td class="right"><b>${escapeHtml(formatDecimal(kgMatParte))}</b></td>
        <td class="right"><b>${escapeHtml(nFleje || "")}</b></td>
        <td class="right"><b>${escapeHtml(formatCajones(maxCajCerv))}</b></td>
        <td class="mono">${piezaMadre ? escapeHtml(piezaMadre) : ""}</td>
      </tr>
    `;
  });

  resultEl.innerHTML = `
    <div class="articulo">
      <div class="articulo-header">SC Kg</div>

      <table class="table">
        <thead>
          <tr>
            <th colspan="2">Base</th>
            <th colspan="3" class="right">Online</th>
            <th colspan="2" class="center">Movimientos</th>
            <th colspan="6" class="right">Info</th>
          </tr>
          <tr>
            <th>Sector</th>
            <th>Descripción</th>

            <th class="right">Kg</th>
            <th class="right">Caj</th>
            <th class="right">Uni</th>

            <th class="center">Fabricación</th>
            <th class="center">Envios PS</th>

            <th class="right">Stock Inicial</th>
            <th class="right">Kg x Uni</th>
            <th class="right">KG Mat PARTE C/Desp</th>
            <th class="right">N Fleje</th>
            <th class="right">Max Caj Cerv</th>
            <th class="right">Pieza Madre</th>
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

  resultEl.querySelectorAll(".mini-popup-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const title = btn.dataset.popupTitle || "";
      const items = String(btn.dataset.popupItems || "").split("|");

      popupTitle.textContent = title;
      popupBody.innerHTML = items
        .map((x) => `<div class="popup-line">${escapeHtml(x)}</div>`)
        .join("");

      popupOverlay.classList.remove("hidden");
    });
  });

  popupClose.addEventListener("click", () => {
    popupOverlay.classList.add("hidden");
  });

  popupOverlay.addEventListener("click", (e) => {
    if (e.target === popupOverlay) {
      popupOverlay.classList.add("hidden");
    }
  });
}

/* =========================================================
   BLOQUE: MAIN
========================================================= */
async function cargarTodo() {
  try {
    setStatus("Cargando datos...");
    resultEl.innerHTML = "";

    const [scRows, enviosPSRows] = await Promise.all([
      cargarBaseSCKg(),
      cargarEnviosPS(),
    ]);

    const enviosPSData = armarMapaEnviosPS(enviosPSRows);

    renderTabla(scRows, enviosPSData);
    setStatus(`Encontradas ${scRows.length} piezas`);
  } catch (err) {
    console.error("ERROR GENERAL:", err);
    setStatus(err.message || "Error al cargar datos");
  }
}

/* =========================================================
   BLOQUE: INICIO
========================================================= */
document.addEventListener("DOMContentLoaded", cargarTodo);