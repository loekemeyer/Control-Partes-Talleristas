"use strict";

const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/*************************************************
 * TABLAS
 *************************************************/
const TABLA_SP_KG = "SP Kg";
const TABLA_PARTES_PS = "Partes x PS";
const TABLA_PARTES_TALL = "Partes x Tallerista";
const TABLA_ENTREGA_PS = "Entrega a PS";
const TABLA_ENVIOS_TALL = "Envios a Talleristas";

/*************************************************
 * DOM
 *************************************************/
const tbodyStocksGeneral = document.getElementById("tbodyStocksGeneral");
const txtBuscar = document.getElementById("txtBuscar");
const selSoloConStock = document.getElementById("selSoloConStock");
const selFormatoStock = document.getElementById("selFormatoStock");
const lblEstado = document.getElementById("lblEstado");
const btnRecargar = document.getElementById("btnRecargar");
const btnInicio = document.getElementById("btnInicio");

/*************************************************
 * STATE
 *************************************************/
let rowsOriginal = [];
let rowsFiltradas = [];

/*************************************************
 * HELPERS
 *************************************************/
function num(n) {
  if (n === null || n === undefined || n === "") return 0;
  if (typeof n === "number") return Number.isFinite(n) ? n : 0;

  let s = String(n).trim();
  if (!s) return 0;

  s = s.replace(/[^\d,.-]/g, "");

  if (s.includes(",") && !s.includes(".")) {
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const v = Number(s);
  return Number.isFinite(v) ? v : 0;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function formatKg(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function formatCaj(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return "";
}

function getFormatoActual() {
  return selFormatoStock?.value || "kg";
}

function formatValorSegunFormato(valor, formato) {
  if (formato === "uni") return formatNumber(valor);
  if (formato === "caj") return formatCaj(valor);
  return formatKg(valor);
}

function convertirKgAFormato(kg, kgUni, kgCaj, formato) {
  const vKg = num(kg);
  const vKgUni = num(kgUni);
  const vKgCaj = num(kgCaj);

  if (formato === "uni") return vKgUni > 0 ? vKg / vKgUni : 0;
  if (formato === "caj") return vKgCaj > 0 ? vKg / vKgCaj : 0;
  return vKg;
}

function addToMap(map, key, value) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + num(value));
}

async function fetchTabla(nombre, columns = "*") {
  const { data, error } = await supabase
    .from(nombre)
    .select(columns);

  if (error) {
    console.error(`Error en tabla ${nombre}:`, error);
    throw new Error(`${nombre}: ${error.message || "error sin detalle"}`);
  }

  return data || [];
}

/*************************************************
 * BASE DESDE SP Kg
 * Ubicación = Sp
 * Descripción = Parte
 *************************************************/
async function getBaseSP() {
  const data = await fetchTabla(TABLA_SP_KG, "*");

  return (data || []).map(r => {
    const ubicacion = String(pick(r, ["Sp", "SP", "sp"])).trim();
    const descripcion = String(pick(r, ["Parte", "PARTE", "parte"])).trim();

    return {
      key: normalizeText(descripcion),
      ubicacion,
      descripcion,
      kgUni: num(pick(r, ["Kg x UNI", "Kg x Uni", "kg x uni", "Kg x UN", "Kg Uni"])),
      kgCaj: num(pick(r, ["Kg Cajon", "Kg x Cajon", "kg cajon", "kg x cajon"]))
    };
  }).filter(r => r.key);
}

/*************************************************
 * SP = 0 + Entregas PS - Envios Tall
 *************************************************/
async function getSPMap() {
  const [entregaPSRows, enviosTallRows] = await Promise.all([
    fetchTabla(TABLA_ENTREGA_PS, "*"),
    fetchTabla(TABLA_ENVIOS_TALL, "*")
  ]);

  const entregaPSMap = new Map();
  const enviosTallMap = new Map();
  const entregaPSDetalle = new Map();
  const enviosTallDetalle = new Map();

  (entregaPSRows || []).forEach(r => {
    const key = normalizeText(pick(r, ["Parte", "PARTE", "parte"]));
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    const prov = String(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"])).trim() || "Entrega PS";

    if (!key) return;

    addToMap(entregaPSMap, key, kg);

    if (!entregaPSDetalle.has(key)) entregaPSDetalle.set(key, []);
    entregaPSDetalle.get(key).push({ label: prov, kg });
  });

  (enviosTallRows || []).forEach(r => {
    const key = normalizeText(pick(r, ["Descripcion", "Descripción", "descripcion"]));
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    const tall = String(pick(r, ["Tallerista", "tallerista", "TALLERISTA"])).trim() || "Tallerista";

    if (!key) return;

    addToMap(enviosTallMap, key, kg);

    if (!enviosTallDetalle.has(key)) enviosTallDetalle.set(key, []);
    enviosTallDetalle.get(key).push({ label: tall, kg: -kg });
  });

  const result = new Map();
  const keys = new Set([...entregaPSMap.keys(), ...enviosTallMap.keys()]);

  keys.forEach(key => {
    const totalKg = num(entregaPSMap.get(key)) - num(enviosTallMap.get(key));
    const detalle = [
      ...(entregaPSDetalle.get(key) || []),
      ...(enviosTallDetalle.get(key) || [])
    ];

    result.set(key, { totalKg, detalle });
  });

  return result;
}

/*************************************************
 * PS = KG Online PS
 * stockInicial + envios - entregas
 *************************************************/
async function getPSMap() {
  const [partesRows, entregaPSRows] = await Promise.all([
    fetchTabla(TABLA_PARTES_PS, "*"),
    fetchTabla(TABLA_ENTREGA_PS, "*")
  ]);

  const baseMap = new Map();
  const detalleMap = new Map();

  (partesRows || []).forEach(r => {
    const key = normalizeText(pick(r, ["Parte", "PARTE", "parte"]));
    const ps = String(pick(r, ["PS", "Ps", "ps"])).trim() || "PS";
    const sp = String(pick(r, ["SP", "Sp", "sp"])).trim();
    const stockInicialUni = num(pick(r, ["Stock Inicial", "stock inicial", "Stock_Inicial"]));

    if (!key || !ps || !sp) return;

    const k = `${normalizeText(ps)}__${normalizeText(sp)}__${key}`;

    baseMap.set(k, {
      parteKey: key,
      ps,
      sp,
      stockInicialUni
    });
  });

  const envMap = new Map();
  const entMap = new Map();

  (partesRows || []).forEach(r => {
    const key = normalizeText(pick(r, ["Parte", "PARTE", "parte"]));
    const ps = String(pick(r, ["PS", "Ps", "ps"])).trim();
    const sp = String(pick(r, ["SP", "Sp", "sp"])).trim();
    const env = 0;

    if (!key || !ps || !sp) return;

    const k = `${normalizeText(ps)}__${normalizeText(sp)}__${key}`;
    addToMap(envMap, k, env);
  });

  (entregaPSRows || []).forEach(r => {
    const key = normalizeText(pick(r, ["Parte", "PARTE", "parte"]));
    const ps = String(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"])).trim();
    const sp = String(pick(r, ["Sector SP", "Sector_SP", "sector sp", "sector_sp"])).trim();
    const kg = num(pick(r, ["KG", "Kg", "kg"]));

    if (!key || !ps || !sp) return;

    const k = `${normalizeText(ps)}__${normalizeText(sp)}__${key}`;
    addToMap(entMap, k, kg);
  });

  const result = new Map();

  baseMap.forEach((base, k) => {
    const onlineKg = num(base.stockInicialUni) + num(envMap.get(k)) - num(entMap.get(k));

    const parteKey = base.parteKey;
    if (!detalleMap.has(parteKey)) detalleMap.set(parteKey, []);
    detalleMap.get(parteKey).push({
      label: base.ps,
      kg: onlineKg
    });
  });

  detalleMap.forEach((detalle, parteKey) => {
    const totalKg = detalle.reduce((acc, x) => acc + num(x.kg), 0);
    result.set(parteKey, { totalKg, detalle });
  });

  return result;
}

/*************************************************
 * TALL = KG Online Tall
 * stockInicial + envios - entregas
 *************************************************/
async function getTallMap() {
  const tallRows = await fetchTabla(TABLA_PARTES_TALL, "*");

  const detalleMap = new Map();

  (tallRows || []).forEach(r => {
    const key = normalizeText(
      pick(r, ["descripcion_parte", "Descripcion_parte", "Descripción_parte", "pieza", "Pieza"])
    );

    const tallerista = String(
      pick(r, ["tallerista", "Tallerista", "TALLERISTA"])
    ).trim() || "Tallerista";

    const onlineKg = num(
      pick(r, ["kg_online", "Kg Online", "KG Online", "kg online", "stock_online", "Stock Online"])
    );

    if (!key) return;

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({
      label: tallerista,
      kg: onlineKg
    });
  });

  const result = new Map();

  detalleMap.forEach((detalle, parteKey) => {
    const totalKg = detalle.reduce((acc, x) => acc + num(x.kg), 0);
    result.set(parteKey, { totalKg, detalle });
  });

  return result;
}

/*************************************************
 * ARMADO FINAL
 *************************************************/
async function construirStocks() {
  const [baseRows, spMap, psMap, tallMap] = await Promise.all([
    getBaseSP(),
    getSPMap(),
    getPSMap(),
    getTallMap()
  ]);

  return baseRows.map(base => {
    const spInfo = spMap.get(base.key) || { totalKg: 0, detalle: [] };
    const psInfo = psMap.get(base.key) || { totalKg: 0, detalle: [] };
    const tallInfo = tallMap.get(base.key) || { totalKg: 0, detalle: [] };

    return {
      key: base.key,
      ubicacion: base.ubicacion || "",
      descripcion: base.descripcion || "",
      kgUni: num(base.kgUni),
      kgCaj: num(base.kgCaj),
      stockSPKg: num(spInfo.totalKg),
      stockPSKg: num(psInfo.totalKg),
      stockTallKg: num(tallInfo.totalKg),
      detalleSP: spInfo.detalle || [],
      detallePS: psInfo.detalle || [],
      detalleTall: tallInfo.detalle || []
    };
  }).sort((a, b) =>
    String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es")
  );
}

/*************************************************
 * DESGLOSE
 *************************************************/
function mostrarDesglose(titulo, detalle, kgUni, kgCaj, formato) {
  if (!detalle || !detalle.length) {
    alert(`${titulo}\n\nSin desglose.`);
    return;
  }

  const texto = detalle.map(item => {
    const valor = convertirKgAFormato(item.kg, kgUni, kgCaj, formato);
    return `${item.label}: ${formatValorSegunFormato(valor, formato)}`;
  }).join("\n");

  alert(`${titulo}\n\n${texto}`);
}

function buildDetalleButton(valorKg, detalle, kgUni, kgCaj, formato, titulo) {
  const valorFormateado = formatValorSegunFormato(
    convertirKgAFormato(valorKg, kgUni, kgCaj, formato),
    formato
  );

  const tieneDetalle = Array.isArray(detalle) && detalle.length > 1;

  if (!tieneDetalle) {
    return `<span>${escapeHtml(valorFormateado)}</span>`;
  }

  return `
    <button
      type="button"
      class="stock-detail-btn"
      data-titulo="${escapeHtml(titulo)}"
      style="border:0;background:transparent;padding:0;margin:0;cursor:pointer;font:inherit;color:inherit;text-decoration:underline;"
    >
      ${escapeHtml(valorFormateado)}
    </button>
  `;
}

/*************************************************
 * RENDER
 *************************************************/
function renderTable(rows) {
  if (!rows.length) {
    tbodyStocksGeneral.innerHTML = `
      <tr>
        <td colspan="5" class="empty">No se encontraron datos.</td>
      </tr>
    `;
    return;
  }

  const formato = getFormatoActual();

  tbodyStocksGeneral.innerHTML = rows.map(r => `
    <tr>
      <td class="text-left">${escapeHtml(r.ubicacion || "")}</td>
      <td class="text-left">${escapeHtml(r.descripcion || "")}</td>

      <td class="text-right ${r.stockSPKg < 0 ? "negativo" : ""}">
        ${buildDetalleButton(r.stockSPKg, r.detalleSP, r.kgUni, r.kgCaj, formato, `Desglose SP - ${r.descripcion || ""}`)}
      </td>

      <td class="text-right ${r.stockPSKg < 0 ? "negativo" : ""}">
        ${buildDetalleButton(r.stockPSKg, r.detallePS, r.kgUni, r.kgCaj, formato, `Desglose PS - ${r.descripcion || ""}`)}
      </td>

      <td class="text-right ${r.stockTallKg < 0 ? "negativo" : ""}">
        ${buildDetalleButton(r.stockTallKg, r.detalleTall, r.kgUni, r.kgCaj, formato, `Desglose Tall - ${r.descripcion || ""}`)}
      </td>
    </tr>
  `).join("");

  tbodyStocksGeneral.querySelectorAll(".stock-detail-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      const tr = e.currentTarget.closest("tr");
      const rowIndex = [...tbodyStocksGeneral.querySelectorAll("tr")].indexOf(tr);
      const row = rows[rowIndex];
      const titulo = btn.dataset.titulo || "Desglose";

      if (titulo.includes("SP")) {
        mostrarDesglose(titulo, row.detalleSP, row.kgUni, row.kgCaj, formato);
      } else if (titulo.includes("Tall")) {
        mostrarDesglose(titulo, row.detalleTall, row.kgUni, row.kgCaj, formato);
      } else {
        mostrarDesglose(titulo, row.detallePS, row.kgUni, row.kgCaj, formato);
      }
    });
  });
}

function aplicarFiltros() {
  const q = normalizeText(txtBuscar.value);
  const modo = selSoloConStock.value;
  const formato = getFormatoActual();

  rowsFiltradas = rowsOriginal.filter(r => {
    const matchBusqueda =
      !q ||
      normalizeText(r.descripcion).includes(q) ||
      normalizeText(r.ubicacion).includes(q);

    const totalAbs =
      Math.abs(convertirKgAFormato(r.stockSPKg, r.kgUni, r.kgCaj, formato)) +
      Math.abs(convertirKgAFormato(r.stockPSKg, r.kgUni, r.kgCaj, formato)) +
      Math.abs(convertirKgAFormato(r.stockTallKg, r.kgUni, r.kgCaj, formato));

    const tieneStock = totalAbs > 0;

    if (modo === "conStock" && !tieneStock) return false;
    if (modo === "sinStock" && tieneStock) return false;

    return matchBusqueda;
  });

  renderTable(rowsFiltradas);
  lblEstado.textContent = `${rowsFiltradas.length} registros`;
}

async function cargarStocksGeneral() {
  try {
    lblEstado.textContent = "Cargando...";
    tbodyStocksGeneral.innerHTML = `
      <tr>
        <td colspan="5" class="empty">Cargando datos...</td>
      </tr>
    `;

    rowsOriginal = await construirStocks();
    aplicarFiltros();
  } catch (error) {
    console.error("ERROR StocksGeneral:", error);
    lblEstado.textContent = `Error: ${error.message || error}`;
    tbodyStocksGeneral.innerHTML = `
      <tr>
        <td colspan="5" class="empty">Error al cargar datos.</td>
      </tr>
    `;
  }
}

/*************************************************
 * EVENTOS
 *************************************************/
txtBuscar.addEventListener("input", aplicarFiltros);
selSoloConStock.addEventListener("change", aplicarFiltros);
selFormatoStock.addEventListener("change", aplicarFiltros);
btnRecargar.addEventListener("click", cargarStocksGeneral);

btnInicio.addEventListener("click", () => {
  window.location.href = "../index.html";
});

cargarStocksGeneral();
