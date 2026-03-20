"use strict";

const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TABLA_SP_KG = "SP Kg";
const TABLA_PARTES_PS = "Partes x PS";
const TABLA_ENVIOS_PS = "Envios a PS";
const TABLA_ENTREGA_PS = "Entrega a PS";
const TABLA_ART_TALL = "Articulos Virgilio X Tallerista";
const TABLA_ENVIOS_TALL = "Envios a Talleristas";

const tbodyStocksGeneral = document.getElementById("tbodyStocksGeneral");
const txtBuscar = document.getElementById("txtBuscar");
const selSoloConStock = document.getElementById("selSoloConStock");
const selFormatoStock = document.getElementById("selFormatoStock");
const lblEstado = document.getElementById("lblEstado");
const btnRecargar = document.getElementById("btnRecargar");
const btnInicio = document.getElementById("btnInicio");

let rowsOriginal = [];
let rowsFiltradas = [];

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

function pick(obj, keys) {
  for (const key of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, key)) {
      return obj[key];
    }
  }
  return "";
}

function calcCaj(kg, kgCaj) {
  const a = num(kg);
  const b = num(kgCaj);
  if (!b) return 0;
  return a / b;
}

function getFormatoActual() {
  return selFormatoStock?.value || "uni";
}

function getValorSegunFormato(row, prefijo, formato) {
  if (formato === "kg") return num(row[`stock${prefijo}Kg`]);
  if (formato === "caj") return num(row[`stock${prefijo}Caj`]);
  return num(row[`stock${prefijo}Uni`]);
}

function formatValorSegunFormato(valor, formato) {
  if (formato === "kg") return formatKg(valor);
  if (formato === "caj") return formatCaj(valor);
  return formatNumber(valor);
}

async function fetchTabla(nombre, columns = "*") {
  const { data, error } = await supabase
    .from(nombre)
    .select(columns);

  if (error) throw error;
  return data || [];
}

async function getSPBase() {
  const data = await fetchTabla(TABLA_SP_KG, "*");

  return (data || []).map(row => {
    const sp = String(pick(row, ["Sp", "SP", "sp"])).trim();
    const descripcion = String(
      pick(row, ["Descripción", "Descripcion", "DESCRIPCION", "descripcion"])
    ).trim();

    const kgUni = num(pick(row, ["Kg x UNI", "Kg x Uni", "kg x uni", "Kg Uni"]));
    const kgCaj = num(pick(row, ["Kg Cajon", "Kg x Cajon", "kg cajon", "kg x cajon"]));
    const stockInicialKg = num(
      pick(row, [
        "Stock Inicial",
        "Stock inicial",
        "STOCK INICIAL",
        "StockInicial",
        "Stock_Inicial",
        "Stock Ini",
        "Stock"
      ])
    );

    const stockSPKg = stockInicialKg;
    const stockSPUni = kgUni > 0 ? stockSPKg / kgUni : 0;
    const stockSPCaj = kgCaj > 0 ? stockSPKg / kgCaj : 0;

    return {
      ubicacion: "SP",
      descripcion: descripcion || sp || "Sin descripción",
      sp,
      kgUni,
      kgCaj,
      stockSPKg,
      stockSPUni,
      stockSPCaj,
      stockPSKg: 0,
      stockPSUni: 0,
      stockPSCaj: 0,
      stockTallKg: 0,
      stockTallUni: 0,
      stockTallCaj: 0
    };
  }).filter(r => r.sp || r.descripcion);
}

async function getPSStockMap() {
  const [partes, envios, entregas, spkg] = await Promise.all([
    fetchTabla(TABLA_PARTES_PS, "*"),
    fetchTabla(TABLA_ENVIOS_PS, "*"),
    fetchTabla(TABLA_ENTREGA_PS, "*"),
    fetchTabla(TABLA_SP_KG, "*")
  ]);

  const spData = new Map();

  (spkg || []).forEach(r => {
    const sp = normalizeText(pick(r, ["Sp", "SP", "sp"]));
    if (!sp) return;

    spData.set(sp, {
      descripcion: String(
        pick(r, ["Descripción", "Descripcion", "DESCRIPCION", "descripcion"])
      ).trim(),
      kgUni: num(pick(r, ["Kg x UNI", "Kg x Uni", "kg x uni", "Kg Uni"])),
      kgCaj: num(pick(r, ["Kg Cajon", "Kg x Cajon", "kg cajon", "kg x cajon"]))
    });
  });

  const psPorSP = new Map();

  (partes || []).forEach(r => {
    const sp = normalizeText(pick(r, ["SP", "Sp", "sp"]));
    const ps = String(pick(r, ["PS", "Ps", "ps"])).trim();

    if (!sp || !ps) return;
    if (!psPorSP.has(sp)) psPorSP.set(sp, new Set());
    psPorSP.get(sp).add(ps);
  });

  const envKgPorPS = new Map();
  (envios || []).forEach(r => {
    const ps = String(pick(r, ["PS", "Ps", "ps"])).trim();
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    if (!ps) return;
    envKgPorPS.set(ps, (envKgPorPS.get(ps) || 0) + kg);
  });

  const entKgPorPS = new Map();
  (entregas || []).forEach(r => {
    const ps = String(pick(r, ["PS", "Ps", "ps"])).trim();
    const kg = num(pick(r, ["KG", "Kg", "kg"]));
    if (!ps) return;
    entKgPorPS.set(ps, (entKgPorPS.get(ps) || 0) + kg);
  });

  const result = new Map();

  psPorSP.forEach((setPS, spNorm) => {
    const base = spData.get(spNorm) || {};
    const descripcion = base.descripcion || "Sin descripción";
    const kgUni = num(base.kgUni);
    const kgCaj = num(base.kgCaj);

    let totalKg = 0;

    [...setPS].forEach(ps => {
      const enviados = num(envKgPorPS.get(ps));
      const entregados = num(entKgPorPS.get(ps));
      totalKg += (enviados - entregados);
    });

    result.set(spNorm, {
      descripcion,
      kgUni,
      kgCaj,
      stockPSKg: totalKg,
      stockPSUni: kgUni > 0 ? totalKg / kgUni : 0,
      stockPSCaj: kgCaj > 0 ? totalKg / kgCaj : 0
    });
  });

  return result;
}

async function getTallStockMap() {
  const [artTall, envTall, spkg] = await Promise.all([
    fetchTabla(TABLA_ART_TALL, "*"),
    fetchTabla(TABLA_ENVIOS_TALL, "*"),
    fetchTabla(TABLA_SP_KG, "*")
  ]);

  const spData = new Map();

  (spkg || []).forEach(r => {
    const sp = normalizeText(pick(r, ["Sp", "SP", "sp"]));
    if (!sp) return;

    spData.set(sp, {
      descripcion: String(
        pick(r, ["Descripción", "Descripcion", "DESCRIPCION", "descripcion"])
      ).trim(),
      kgUni: num(pick(r, ["Kg x UNI", "Kg x Uni", "kg x uni", "Kg Uni"])),
      kgCaj: num(pick(r, ["Kg Cajon", "Kg x Cajon", "kg cajon", "kg x cajon"]))
    });
  });

  const stockKgPorSP = new Map();

  (artTall || []).forEach(r => {
    const sp = normalizeText(pick(r, ["Sp", "SP", "sp", "Cod_Art", "Cod Art"]));
    const stock = num(pick(r, ["Stock Online", "stock online", "Stock_Online", "stock_online"]));
    if (!sp) return;
    stockKgPorSP.set(sp, (stockKgPorSP.get(sp) || 0) + stock);
  });

  (envTall || []).forEach(() => {
    // lo dejo sin sumar/restar porque según tus archivos no hay estructura
    // consistente para reconstruir entregas netas de talleristas desde acá
  });

  const result = new Map();

  stockKgPorSP.forEach((totalKg, spNorm) => {
    const base = spData.get(spNorm) || {};
    const descripcion = base.descripcion || "Sin descripción";
    const kgUni = num(base.kgUni);
    const kgCaj = num(base.kgCaj);

    result.set(spNorm, {
      descripcion,
      kgUni,
      kgCaj,
      stockTallKg: totalKg,
      stockTallUni: kgUni > 0 ? totalKg / kgUni : 0,
      stockTallCaj: kgCaj > 0 ? totalKg / kgCaj : 0
    });
  });

  return result;
}

function unirStocks(baseRows, psMap, tallMap) {
  const merged = new Map();

  baseRows.forEach(r => {
    const key = normalizeText(r.sp || r.descripcion);
    merged.set(key, { ...r });
  });

  psMap.forEach((psRow, key) => {
    if (!merged.has(key)) {
      merged.set(key, {
        ubicacion: "PS",
        descripcion: psRow.descripcion || "Sin descripción",
        sp: key,
        kgUni: num(psRow.kgUni),
        kgCaj: num(psRow.kgCaj),
        stockSPKg: 0,
        stockSPUni: 0,
        stockSPCaj: 0,
        stockPSKg: 0,
        stockPSUni: 0,
        stockPSCaj: 0,
        stockTallKg: 0,
        stockTallUni: 0,
        stockTallCaj: 0
      });
    }

    const row = merged.get(key);
    row.stockPSKg = num(psRow.stockPSKg);
    row.stockPSUni = num(psRow.stockPSUni);
    row.stockPSCaj = num(psRow.stockPSCaj);

    if (!row.descripcion) row.descripcion = psRow.descripcion || "Sin descripción";
    if (!row.kgUni) row.kgUni = num(psRow.kgUni);
    if (!row.kgCaj) row.kgCaj = num(psRow.kgCaj);
  });

  tallMap.forEach((tRow, key) => {
    if (!merged.has(key)) {
      merged.set(key, {
        ubicacion: "Tall",
        descripcion: tRow.descripcion || "Sin descripción",
        sp: key,
        kgUni: num(tRow.kgUni),
        kgCaj: num(tRow.kgCaj),
        stockSPKg: 0,
        stockSPUni: 0,
        stockSPCaj: 0,
        stockPSKg: 0,
        stockPSUni: 0,
        stockPSCaj: 0,
        stockTallKg: 0,
        stockTallUni: 0,
        stockTallCaj: 0
      });
    }

    const row = merged.get(key);
    row.stockTallKg = num(tRow.stockTallKg);
    row.stockTallUni = num(tRow.stockTallUni);
    row.stockTallCaj = num(tRow.stockTallCaj);

    if (!row.descripcion) row.descripcion = tRow.descripcion || "Sin descripción";
    if (!row.kgUni) row.kgUni = num(tRow.kgUni);
    if (!row.kgCaj) row.kgCaj = num(tRow.kgCaj);
  });

  return [...merged.values()].sort((a, b) =>
    String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es")
  );
}

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

  tbodyStocksGeneral.innerHTML = rows.map(r => {
    const sp = getValorSegunFormato(r, "SP", formato);
    const ps = getValorSegunFormato(r, "PS", formato);
    const tall = getValorSegunFormato(r, "Tall", formato);

    return `
      <tr>
        <td class="text-left">${formato === "kg" ? "Kg" : (formato === "caj" ? "Cajón" : "Unidades")}</td>
        <td class="text-left">${r.descripcion || ""}</td>
        <td class="text-right ${sp < 0 ? "negativo" : ""}">${formatValorSegunFormato(sp, formato)}</td>
        <td class="text-right ${ps < 0 ? "negativo" : ""}">${formatValorSegunFormato(ps, formato)}</td>
        <td class="text-right ${tall < 0 ? "negativo" : ""}">${formatValorSegunFormato(tall, formato)}</td>
      </tr>
    `;
  }).join("");
}

function aplicarFiltros() {
  const q = normalizeText(txtBuscar.value);
  const modo = selSoloConStock.value;
  const formato = getFormatoActual();

  rowsFiltradas = rowsOriginal.filter(r => {
    const matchBusqueda = !q || normalizeText(r.descripcion).includes(q);

    const totalAbs =
      Math.abs(getValorSegunFormato(r, "SP", formato)) +
      Math.abs(getValorSegunFormato(r, "PS", formato)) +
      Math.abs(getValorSegunFormato(r, "Tall", formato));

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

    const [baseRows, psMap, tallMap] = await Promise.all([
      getSPBase(),
      getPSStockMap(),
      getTallStockMap()
    ]);

    rowsOriginal = unirStocks(baseRows, psMap, tallMap);
    aplicarFiltros();
  } catch (error) {
    console.error(error);
    lblEstado.textContent = `Error: ${error.message || error}`;
    tbodyStocksGeneral.innerHTML = `
      <tr>
        <td colspan="5" class="empty">Error al cargar datos.</td>
      </tr>
    `;
  }
}

txtBuscar.addEventListener("input", aplicarFiltros);
selSoloConStock.addEventListener("change", aplicarFiltros);
selFormatoStock.addEventListener("change", aplicarFiltros);
btnRecargar.addEventListener("click", cargarStocksGeneral);

btnInicio.addEventListener("click", () => {
  window.location.href = "index.html";
});

cargarStocksGeneral();
