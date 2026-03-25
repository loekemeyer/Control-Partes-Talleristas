"use strict";

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
function setStatus(texto) {
  statusEl.textContent = texto || "";
}

function escapeHtml(texto) {
  return String(texto || "")
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
  return Math.round(Number(n || 0)).toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });
}

function formatDecimal(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function sortKeyFechaDDMM(value) {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return 9999;
  return Number(m[2]) * 100 + Number(m[1]);
}

/* =========================================================
   BLOQUE: CARGA BASE SP Kg
========================================================= */
async function cargarBaseSPKg() {
  const { data, error } = await supabaseClient
    .from("SP Kg")
    .select(
      `
      "Sp",
      "Parte",
      "Max Cajon SP Total",
      "Kg x Uni",
      "Stock Inicial",
      "KG x Cajon"
    `,
    )
    .order("Sp", { ascending: true });

  if (error) {
    console.error(error);
    throw new Error(`Error al leer SP Kg: ${error.message}`);
  }

  return data || [];
}

/* =========================================================
   BLOQUE: CARGA ENTREGAS PS
   Toma KG por Sector SP
========================================================= */
async function cargarEntregasPS() {
  const { data, error } = await supabaseClient
    .from("Entregas PS")
    .select(
      `
      "Dia-mes",
      "Sector SP",
      "Parte",
      "KG"
    `,
    )
    .limit(20000);

  if (error) {
    console.error(error);
    throw new Error(`Error al leer Entregas PS: ${error.message}`);
  }

  return data || [];
}

/* =========================================================
   BLOQUE: CARGA ENVIOS A TALLERISTAS
   Toma KG por Sector
========================================================= */
async function cargarEnviosTalleristas() {
  const { data, error } = await supabaseClient
    .from("Envios a Talleristas")
    .select(
      `
      "Dia-mes",
      "Sector",
      "Descripcion",
      "KG"
    `,
    )
    .limit(20000);

  if (error) {
    console.error(error);
    throw new Error(`Error al leer Envios a Talleristas: ${error.message}`);
  }

  return data || [];
}

/* =========================================================
   BLOQUE: MAPA ENTREGAS PS POR SECTOR
========================================================= */
function armarMapaEntregasPS(rows) {
  const totalMap = new Map();
  const detalleMap = new Map();

  rows.forEach((r) => {
    const sector = normalizeText(r["Sector SP"]);
    const kg = parseDecimal(r["KG"]);
    const fecha = String(r["Dia-mes"] || "").trim();
    const parte = String(r["Parte"] || "").trim();

    if (!sector) return;
    if (!kg) return;

    const key = sector;

    totalMap.set(key, (totalMap.get(key) || 0) + kg);

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({ fecha, kg, parte });
  });

  for (const [key, arr] of detalleMap.entries()) {
    arr.sort((a, b) => sortKeyFechaDDMM(a.fecha) - sortKeyFechaDDMM(b.fecha));
    detalleMap.set(key, arr);
  }

  return { totalMap, detalleMap };
}

/* =========================================================
   BLOQUE: MAPA ENVIOS TALLERISTAS POR SECTOR
========================================================= */
function armarMapaEnviosTalleristas(rows) {
  const totalMap = new Map();
  const detalleMap = new Map();

  rows.forEach((r) => {
    const sector = normalizeText(r["Sector"]);
    const kg = parseDecimal(r["KG"]);
    const fecha = String(r["Dia-mes"] || "").trim();
    const descripcion = String(r["Descripcion"] || "").trim();

    if (!sector) return;
    if (!kg) return;

    const key = sector;

    totalMap.set(key, (totalMap.get(key) || 0) + kg);

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({ fecha, kg, descripcion });
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
function detalleToPopup(detalle, etiqueta, campoTexto) {
  if (!detalle.length) return `Sin ${etiqueta}`;

  return detalle
    .map((x) => {
      const extra = x[campoTexto] ? ` - ${x[campoTexto]}` : "";
      return `${x.fecha || "Sin fecha"}${extra} - ${formatDecimal(x.kg)} kg`;
    })
    .join("|");
}

/* =========================================================
   BLOQUE: RENDER TABLA
========================================================= */
function renderTabla(spRows, entregasPSData, enviosTallData) {
  let rows = "";

  spRows.forEach((r) => {
    const sector = String(r["Sp"] || "").trim();
    const descripcion = String(r["Parte"] || "").trim();
    const key = normalizeText(sector);

    const stockInicial = parseDecimal(r["Stock Inicial"]);
    const kgXUni = parseDecimal(r["Kg x Uni"]);
    const maxCajones = parseDecimal(r["Max Cajon SP Total"]);

    const entregasPSKg = Number(entregasPSData.totalMap.get(key) || 0);
    const enviosTallKg = Number(enviosTallData.totalMap.get(key) || 0);

    /* =========================================================
       BLOQUE: MOVIMIENTOS EN UNIDADES
    ========================================================= */
    const entregasPSUni = kgXUni > 0 ? entregasPSKg / kgXUni : 0;
    const enviosTallUni = kgXUni > 0 ? enviosTallKg / kgXUni : 0;

    /* =========================================================
       BLOQUE: ONLINE KG
    ========================================================= */
    const onlineKg = stockInicial + entregasPSKg - enviosTallKg;

    /* =========================================================
       BLOQUE: ONLINE UNI
       Uni = Online KG / Kg x Uni
    ========================================================= */
    const onlineUni = kgXUni > 0 ? onlineKg / kgXUni : 0;

    /* =========================================================
       BLOQUE: ONLINE CAJ
       Por ahora lo dejamos en 0
    ========================================================= */
    const onlineCaj = 0;

    const detalleEntregasPS = entregasPSData.detalleMap.get(key) || [];
    const detalleEnviosTall = enviosTallData.detalleMap.get(key) || [];

    const popupEntregasPS = detalleToPopup(
      detalleEntregasPS,
      "entregas PS",
      "parte",
    );

    const popupEnviosTall = detalleToPopup(
      detalleEnviosTall,
      "envíos a talleristas",
      "descripcion",
    );

    rows += `
      <tr>
        <td>${escapeHtml(sector)}</td>
        <td>${escapeHtml(descripcion)}</td>

        <td class="right"><b>${escapeHtml(formatDecimal(onlineKg))}</b></td>
        <td class="right"><b>${escapeHtml(formatDecimal(onlineCaj))}</b></td>
        <td class="right"><b>${escapeHtml(formatNumber(onlineUni))}</b></td>

        <td class="center">
          <div class="cell-combo">
            <span class="cell-total">${escapeHtml(formatNumber(entregasPSUni))}</span>
            <button
              type="button"
              class="mini-popup-btn"
              data-popup-title="${escapeHtml(`Entregas PS - ${descripcion}`)}"
              data-popup-items="${escapeHtml(popupEntregasPS)}"
            >+</button>
          </div>
        </td>

        <td class="center">
          <div class="cell-combo">
            <span class="cell-total">${escapeHtml(formatNumber(enviosTallUni))}</span>
            <button
              type="button"
              class="mini-popup-btn"
              data-popup-title="${escapeHtml(`Envíos a Talleristas - ${descripcion}`)}"
              data-popup-items="${escapeHtml(popupEnviosTall)}"
            >+</button>
          </div>
        </td>

        <td class="right"><b>${escapeHtml(formatDecimal(stockInicial))}</b></td>
        <td class="right"><b>${escapeHtml(formatDecimal(kgXUni))}</b></td>
        <td class="right"><b>${escapeHtml(formatDecimal(30))}</b></td>
        <td class="right"><b>${escapeHtml(formatNumber(0))}</b></td>
        <td class="right"><b>${escapeHtml(formatDecimal(maxCajones))}</b></td>
        <td class="mono"></td>
      </tr>
    `;
  });

  resultEl.innerHTML = `
    <div class="articulo">
      <div class="articulo-header">SP Kg</div>

      <table class="table">
        <thead>
          <tr>
            <th colspan="2">Base</th>
            <th colspan="3" class="right">Online</th>
            <th colspan="2" class="center">Movimientos (Uni)</th>
            <th colspan="6" class="right">Info</th>
          </tr>
          <tr>
            <th>Sector</th>
            <th>Descripción</th>

            <th class="right">Kg</th>
            <th class="right">Caj</th>
            <th class="right">Uni</th>

            <th class="center">Entregas PS</th>
            <th class="center">Envíos Tallerista</th>

            <th class="right">Stock Inicial</th>
            <th class="right">Kg x Uni</th>
            <th class="right">Kg x Cajon</th>
            <th class="right">Cons x Parte</th>
            <th class="right">Max Cajones</th>
            <th class="right">Codigos</th>
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

    const [spRows, entregasPSRows, enviosTallRows] = await Promise.all([
      cargarBaseSPKg(),
      cargarEntregasPS(),
      cargarEnviosTalleristas(),
    ]);

    const entregasPSData = armarMapaEntregasPS(entregasPSRows);
    const enviosTallData = armarMapaEnviosTalleristas(enviosTallRows);

    renderTabla(spRows, entregasPSData, enviosTallData);
    setStatus(`Encontradas ${spRows.length} piezas`);
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Error al cargar datos");
  }
}

/* =========================================================
   BLOQUE: INICIO
========================================================= */
document.addEventListener("DOMContentLoaded", cargarTodo);
