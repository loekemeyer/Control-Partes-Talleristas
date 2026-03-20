"use strict";
const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/*************************************************
 * TABLAS
 *************************************************/
const TABLA_SC_KG = "SC Kg";
const TABLA_SP_KG = "SP Kg";
const TABLA_PARTES_PS = "Partes x PS";
const TABLA_PARTES_TALL = "Partes x Tallerista";
const TABLA_ENTREGA_PS = "Entregas PS";
const TABLA_ENVIOS_TALL = "Envios a Talleristas";
const TABLA_PIEZA_MADRE = "Pieza Madre";
const TABLA_ENVIOS_PS = "Envios a PS";
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
  const { data, error } = await sb
    .from(nombre)
    .select(columns);

  if (error) {
    console.error(`Error en tabla ${nombre}:`, error);
    throw new Error(`${nombre}: ${error.message || "error sin detalle"}`);
  }

  return data || [];
}

let indicesPiezaMadreCache = null;

function formatPopupKg(n) {
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3
  });
}

async function cargarIndicesPiezaMadre() {
  if (indicesPiezaMadreCache) return indicesPiezaMadreCache;

  const [piezaMadreRows, spRows, scRows] = await Promise.all([
    fetchTabla(TABLA_PIEZA_MADRE, 'id,"Pieza Madre"'),
    fetchTabla(TABLA_SP_KG, "*"),
    fetchTabla(TABLA_SC_KG, "*")
  ]);

  const spPorParte = new Map();
  const spPorSector = new Map();
  const scPorDescripcion = new Map();
  const scPorSector = new Map();
  const sectorPorPieza = new Map();

  function ensureSector(piezaMadre) {
    const key = normalizeText(piezaMadre);
    if (!sectorPorPieza.has(key)) {
      sectorPorPieza.set(key, {
        spSet: new Set(),
        scSet: new Set(),
        kgUni: 0,
        kgCaj: 0
      });
    }
    return sectorPorPieza.get(key);
  }

  (spRows || []).forEach(r => {
    const piezaMadre = String(pick(r, ["Pieza Madre", "pieza madre"])).trim();
    const parte = String(pick(r, ["Parte", "PARTE", "parte"])).trim();
    const sp = String(pick(r, ["Sp", "SP", "sp"])).trim();
    const kgUni = num(pick(r, ["Kg x UNI", "Kg x Uni", "kg x uni", "Kg x UN", "Kg Uni"]));
    const kgCaj = num(pick(r, ["Kg Cajon", "Kg x Cajon", "kg cajon", "kg x cajon"]));

    if (!piezaMadre) return;

    const ref = { piezaMadre, sp, kgUni, kgCaj };

    if (parte) spPorParte.set(normalizeText(parte), ref);
    if (sp) spPorSector.set(normalizeText(sp), ref);

    const sec = ensureSector(piezaMadre);
    if (sp) sec.spSet.add(sp);
    if (!sec.kgUni && kgUni) sec.kgUni = kgUni;
    if (!sec.kgCaj && kgCaj) sec.kgCaj = kgCaj;
  });

  (scRows || []).forEach(r => {
    const piezaMadre = String(pick(r, ["Pieza Madre", "pieza madre"])).trim();
    const descripcion = String(pick(r, ["Descripcion", "Descripción", "descripcion"])).trim();
    const sc = String(pick(r, ["SC", "Sc", "sc"])).trim();
    const kgUni = num(pick(r, ["Kg x Uni", "Kg X Uni", "kg x uni"]));
    const kgCaj = num(pick(r, ["Max Caj Cerv", "Max Cajon Cerv", "max caj cerv"]));

    if (!piezaMadre) return;

    const ref = { piezaMadre, sc, kgUni, kgCaj };

    if (descripcion) scPorDescripcion.set(normalizeText(descripcion), ref);
    if (sc) scPorSector.set(normalizeText(sc), ref);

    const sec = ensureSector(piezaMadre);
    if (sc) sec.scSet.add(sc);
    if (!sec.kgUni && kgUni) sec.kgUni = kgUni;
    if (!sec.kgCaj && kgCaj) sec.kgCaj = kgCaj;
  });

  indicesPiezaMadreCache = {
    piezaMadreRows: piezaMadreRows || [],
    spPorParte,
    spPorSector,
    scPorDescripcion,
    scPorSector,
    sectorPorPieza
  };

  return indicesPiezaMadreCache;
}

function resolverRefSP(r, idx) {
  const sp = normalizeText(pick(r, ["Sector SP", "Sector_SP", "sector sp", "sector_sp", "SP", "Sp", "sp"]));
  const parte = normalizeText(pick(r, ["Parte", "PARTE", "parte"]));
  return idx.spPorSector.get(sp) || idx.spPorParte.get(parte) || null;
}

function resolverRefSC(r, idx) {
  const sc = normalizeText(pick(r, ["SC", "Sc", "sc"]));
  const descripcion = normalizeText(
    pick(r, ["Descripcion", "Descripción", "descripcion", "descripcion_parte", "Descripcion_parte", "Descripción_parte", "pieza", "Pieza"])
  );
  return idx.scPorSector.get(sc) || idx.scPorDescripcion.get(descripcion) || null;
}

function ensurePopupStocks() {
  if (document.getElementById("stocksPopupOverlay")) return;

  const div = document.createElement("div");
  div.innerHTML = `
    <div id="stocksPopupOverlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.28);z-index:9999;align-items:center;justify-content:center;padding:16px;">
      <div style="width:min(520px,100%);max-height:80vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.18);">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid #e5e7eb;">
          <div id="stocksPopupTitle" style="font-weight:700;font-size:18px;"></div>
          <button id="stocksPopupClose" type="button" style="border:0;background:#fff;font-size:18px;cursor:pointer;">✕</button>
        </div>
        <div id="stocksPopupBody" style="padding:8px 0;"></div>
      </div>
    </div>
  `;
  document.body.appendChild(div.firstElementChild);

  const overlay = document.getElementById("stocksPopupOverlay");
  const close = document.getElementById("stocksPopupClose");

  close.addEventListener("click", () => {
    overlay.style.display = "none";
  });

  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.style.display = "none";
  });
}

function abrirPopupStocks(titulo, detalle, kgUni, kgCaj) {
  ensurePopupStocks();

  const overlay = document.getElementById("stocksPopupOverlay");
  const title = document.getElementById("stocksPopupTitle");
  const body = document.getElementById("stocksPopupBody");

  title.textContent = titulo || "Desglose";

  if (!detalle || !detalle.length) {
    body.innerHTML = `<div style="padding:14px 16px;">Sin movimientos.</div>`;
    overlay.style.display = "flex";
    return;
  }

  body.innerHTML = detalle.map(item => {
    const kg = num(item.kg);
    const caj = item.cajones !== undefined && item.cajones !== null
      ? num(item.cajones)
      : (num(kgCaj) > 0 ? kg / num(kgCaj) : 0);
    const uni = num(kgUni) > 0 ? Math.floor(kg / num(kgUni)) : 0;

    const partes = [];
    if (item.fecha) partes.push(item.fecha);
    if (item.label) partes.push(item.label);
    partes.push(`${formatPopupKg(kg)} kg`);
    partes.push(`${formatCaj(caj)} caj`);
    partes.push(`${formatNumber(uni)} uni`);

    return `<div style="padding:12px 16px;border-top:1px solid #f0f0f0;">${escapeHtml(partes.join(" - "))}</div>`;
  }).join("");

  overlay.style.display = "flex";
}

function buildMovimientoCell(valorKg, detalle, rowIndex, tipo, kgUni, kgCaj, formato) {
  const total = formatValorSegunFormato(
    convertirKgAFormato(valorKg, kgUni, kgCaj, formato),
    formato
  );

  const tieneDetalle = Array.isArray(detalle) && detalle.length > 0;

  if (!tieneDetalle) {
    return `<span>${escapeHtml(total)}</span>`;
  }

  return `
    <div style="display:inline-flex;align-items:center;gap:8px;justify-content:flex-end;">
      <span>${escapeHtml(total)}</span>
      <button
        type="button"
        class="mini-popup-btn-stock"
        data-row-index="${rowIndex}"
        data-tipo="${tipo}"
        style="width:22px;height:22px;border:1px solid #bfc5cc;border-radius:999px;background:#fff;cursor:pointer;font-weight:700;line-height:1;"
      >+</button>
    </div>
  `;
}

/*************************************************
 * BASE DESDE SC Kg + Pieza Madre
 * Descripción = Pieza Madre
 * Ubicación = SC
 *************************************************/
async function getBaseSP() {
  const [piezaMadreRows, scRows, spRows] = await Promise.all([
    fetchTabla(TABLA_PIEZA_MADRE, 'id,"Pieza Madre"'),
    fetchTabla(TABLA_SC_KG, "*"),
    fetchTabla(TABLA_SP_KG, "*")
  ]);

  const sectoresPorPieza = new Map();

  function ensureItem(piezaMadre) {
    const key = normalizeText(piezaMadre);
    if (!sectoresPorPieza.has(key)) {
      sectoresPorPieza.set(key, {
        scSet: new Set(),
        spSet: new Set(),
        kgUni: 0,
        kgCaj: 0
      });
    }
    return sectoresPorPieza.get(key);
  }

  (scRows || []).forEach(r => {
    const piezaMadre = String(pick(r, ["Pieza Madre", "pieza madre"])).trim();
    const sc = String(pick(r, ["SC", "Sc", "sc"])).trim();
    const kgUni = num(pick(r, ["Kg x Uni", "Kg X Uni", "kg x uni"]));
    const kgCaj = num(pick(r, ["Max Caj Cerv", "Max Cajon Cerv", "max caj cerv"]));

    if (!piezaMadre) return;

    const item = ensureItem(piezaMadre);
    if (sc) item.scSet.add(sc);
    if (!item.kgUni && kgUni) item.kgUni = kgUni;
    if (!item.kgCaj && kgCaj) item.kgCaj = kgCaj;
  });

  (spRows || []).forEach(r => {
    const piezaMadre = String(pick(r, ["Pieza Madre", "pieza madre"])).trim();
    const sp = String(pick(r, ["Sp", "SP", "sp"])).trim();
    const kgUni = num(pick(r, ["Kg x UNI", "Kg x Uni", "kg x uni", "Kg x UN", "Kg Uni"]));
    const kgCaj = num(pick(r, ["Kg Cajon", "Kg x Cajon", "kg cajon", "kg x cajon"]));

    if (!piezaMadre) return;

    const item = ensureItem(piezaMadre);
    if (sp) item.spSet.add(sp);
    if (!item.kgUni && kgUni) item.kgUni = kgUni;
    if (!item.kgCaj && kgCaj) item.kgCaj = kgCaj;
  });

  return (piezaMadreRows || []).map(r => {
    const descripcion = String(r["Pieza Madre"] || "").trim();
    const info = sectoresPorPieza.get(normalizeText(descripcion)) || null;

    const scTexto = info && info.scSet.size ? `SC: ${[...info.scSet].join(", ")}` : "";
    const spTexto = info && info.spSet.size ? `SP: ${[...info.spSet].join(", ")}` : "";

    const sectores = [scTexto, spTexto].filter(Boolean).join(" | ");

    return {
      key: normalizeText(descripcion),
      sectores,
      sc: info && info.scSet.size ? [...info.scSet].join(", ") : "",
      descripcion,
      kgUni: num(info?.kgUni),
      kgCaj: num(info?.kgCaj)
    };
  }).filter(r => r.key);
}

/*************************************************
 * SP = 0 + Entregas PS - Envios Tall
 *************************************************/
async function getSPMap() {
  const [idx, entregaPSRows, enviosTallRows] = await Promise.all([
    cargarIndicesPiezaMadre(),
    fetchTabla(TABLA_ENTREGA_PS, "*"),
    fetchTabla(TABLA_ENVIOS_TALL, "*")
  ]);

  const entregaPSMap = new Map();
  const enviosTallMap = new Map();
  const entregaPSDetalle = new Map();
  const enviosTallDetalle = new Map();

  (entregaPSRows || []).forEach(r => {
    const ref = resolverRefSP(r, idx);
    const key = normalizeText(ref?.piezaMadre || "");
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    const cajones = num(pick(r, ["Cajones", "cajones", "CAJONES"]));
    const prov = String(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"])).trim() || "Entrega PS";
    const fecha = String(pick(r, ["Dia-mes", "Dia_mes", "dia-mes", "dia_mes"])).trim();

    if (!key) return;

    addToMap(entregaPSMap, key, kg);

    if (!entregaPSDetalle.has(key)) entregaPSDetalle.set(key, []);
    entregaPSDetalle.get(key).push({ label: prov, fecha, kg, cajones });
  });

  (enviosTallRows || []).forEach(r => {
    const ref = resolverRefSC(r, idx);
    const key = normalizeText(ref?.piezaMadre || "");
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    const cajones = num(pick(r, ["Cajones", "cajones", "CAJONES"]));
    const tall = String(pick(r, ["Tallerista", "tallerista", "TALLERISTA"])).trim() || "Tallerista";
    const fecha = String(pick(r, ["Dia-mes", "Dia_mes", "dia-mes", "dia_mes"])).trim();

    if (!key) return;

    addToMap(enviosTallMap, key, kg);

    if (!enviosTallDetalle.has(key)) enviosTallDetalle.set(key, []);
    enviosTallDetalle.get(key).push({ label: tall, fecha, kg: -kg, cajones: -cajones });
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
  const [idx, partesRows, enviosPSRows, entregaPSRows] = await Promise.all([
    cargarIndicesPiezaMadre(),
    fetchTabla(TABLA_PARTES_PS, "*"),
    fetchTabla(TABLA_ENVIOS_PS, "*"),
    fetchTabla(TABLA_ENTREGA_PS, "*")
  ]);

  const baseMap = new Map();
  const detalleMap = new Map();
  const envMap = new Map();
  const entMap = new Map();

  (partesRows || []).forEach(r => {
    const ref = resolverRefSP(r, idx);
    const piezaMadre = String(ref?.piezaMadre || "").trim();
    const parteKey = normalizeText(piezaMadre);
    const ps = String(pick(r, ["PS", "Ps", "ps"])).trim() || "PS";
    const sp = String(pick(r, ["SP", "Sp", "sp"])).trim();
    const stockInicialUni = num(pick(r, ["Stock Inicial", "stock inicial", "Stock_Inicial"]));
    const kgUni = num(ref?.kgUni);

    if (!parteKey || !ps || !sp) return;

    const k = `${normalizeText(ps)}__${normalizeText(sp)}__${parteKey}`;

    baseMap.set(k, {
      parteKey,
      ps,
      sp,
      stockInicialKg: stockInicialUni * kgUni
    });
  });

  (enviosPSRows || []).forEach(r => {
    const ref = resolverRefSP(r, idx);
    const parteKey = normalizeText(ref?.piezaMadre || "");
    const ps = String(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"])).trim();
    const sp = String(pick(r, ["Sector SP", "Sector_SP", "sector sp", "sector_sp"])).trim();
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    const cajones = num(pick(r, ["Cajones", "cajones", "CAJONES"]));
    const fecha = String(pick(r, ["Dia-mes", "Dia_mes", "dia-mes", "dia_mes"])).trim();

    if (!parteKey || !ps || !sp) return;

    const k = `${normalizeText(ps)}__${normalizeText(sp)}__${parteKey}`;
    addToMap(envMap, k, kg);

    if (!detalleMap.has(parteKey)) detalleMap.set(parteKey, []);
    detalleMap.get(parteKey).push({ label: `${ps} (envío)`, fecha, kg, cajones });
  });

  (entregaPSRows || []).forEach(r => {
    const ref = resolverRefSP(r, idx);
    const parteKey = normalizeText(ref?.piezaMadre || "");
    const ps = String(pick(r, ["Prov_Serv", "Prov Serv", "prov_serv"])).trim();
    const sp = String(pick(r, ["Sector SP", "Sector_SP", "sector sp", "sector_sp"])).trim();
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    const cajones = num(pick(r, ["Cajones", "cajones", "CAJONES"]));
    const fecha = String(pick(r, ["Dia-mes", "Dia_mes", "dia-mes", "dia_mes"])).trim();

    if (!parteKey || !ps || !sp) return;

    const k = `${normalizeText(ps)}__${normalizeText(sp)}__${parteKey}`;
    addToMap(entMap, k, kg);

    if (!detalleMap.has(parteKey)) detalleMap.set(parteKey, []);
    detalleMap.get(parteKey).push({ label: `${ps} (entrega)`, fecha, kg: -kg, cajones: -cajones });
  });

  const result = new Map();

  baseMap.forEach((base, k) => {
    const onlineKg = num(base.stockInicialKg) + num(envMap.get(k)) - num(entMap.get(k));

    if (!result.has(base.parteKey)) {
      result.set(base.parteKey, { totalKg: 0, detalle: [] });
    }

    const curr = result.get(base.parteKey);
    curr.totalKg += onlineKg;
  });

  detalleMap.forEach((detalle, parteKey) => {
    if (!result.has(parteKey)) {
      result.set(parteKey, { totalKg: 0, detalle: [] });
    }
    result.get(parteKey).detalle = detalle;
  });

  return result;
}
/*************************************************
 * TALL = KG Online Tall
 * stockInicial + envios - entregas
 *************************************************/
async function getTallMap() {
  const [idx, tallRows] = await Promise.all([
    cargarIndicesPiezaMadre(),
    fetchTabla(TABLA_PARTES_TALL, "*")
  ]);

  const detalleMap = new Map();

  (tallRows || []).forEach(r => {
    const ref = resolverRefSC(r, idx);
    const key = normalizeText(ref?.piezaMadre || "");

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
      sectores: base.sectores || "",
      sc: base.sc || "",
      sp: base.sp || "",
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
        <td colspan="6" class="empty">No se encontraron datos.</td>
      </tr>
    `;
    return;
  }

  const formato = getFormatoActual();

  tbodyStocksGeneral.innerHTML = rows.map((r, index) => `
    <tr>
      <td class="text-left">${escapeHtml(r.sectores || "")}</td>
      <td class="text-left">${escapeHtml(r.descripcion || "")}</td>
      <td class="text-left">${escapeHtml(r.sc || "")}</td>

      <td class="text-right ${r.stockSPKg < 0 ? "negativo" : ""}">
        ${buildMovimientoCell(r.stockSPKg, r.detalleSP, index, "sp", r.kgUni, r.kgCaj, formato)}
      </td>

      <td class="text-right ${r.stockPSKg < 0 ? "negativo" : ""}">
        ${buildMovimientoCell(r.stockPSKg, r.detallePS, index, "ps", r.kgUni, r.kgCaj, formato)}
      </td>

      <td class="text-right ${r.stockTallKg < 0 ? "negativo" : ""}">
        ${buildMovimientoCell(r.stockTallKg, r.detalleTall, index, "tall", r.kgUni, r.kgCaj, formato)}
      </td>
    </tr>
  `).join("");

  tbodyStocksGeneral.querySelectorAll(".mini-popup-btn-stock").forEach(btn => {
    btn.addEventListener("click", () => {
      const rowIndex = Number(btn.dataset.rowIndex);
      const tipo = btn.dataset.tipo;
      const row = rows[rowIndex];
      if (!row) return;

      if (tipo === "sp") {
        abrirPopupStocks(`SP - ${row.descripcion || ""}`, row.detalleSP, row.kgUni, row.kgCaj);
      } else if (tipo === "ps") {
        abrirPopupStocks(`PS - ${row.descripcion || ""}`, row.detallePS, row.kgUni, row.kgCaj);
      } else {
        abrirPopupStocks(`Tall - ${row.descripcion || ""}`, row.detalleTall, row.kgUni, row.kgCaj);
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
      normalizeText(r.sectores).includes(q);

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
  window.location.href = "../Inicio/index.html";
});

cargarStocksGeneral();
