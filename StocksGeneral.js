const SUPABASE_URL = "PONER_ACA_TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PONER_ACA_TU_SUPABASE_ANON_KEY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/*
  ==============================
  CONFIGURACION DE TABLAS/CAMPOS
  ==============================

  Ajustá estos nombres para que coincidan con tu Supabase.

  TABLA BASE:
  Debe tener, idealmente:
  - SC
  - SP
  - Descripción
  - Kg x Uni
  - Kg x Caj
  - Stock Inicial

  MOVIMIENTOS:
  Cada tabla de movimientos debería tener:
  - codigo / SC / SP / artículo (algún identificador)
  - cantidad (unidades)

  En este ejemplo voy a usar "SC" como clave principal.
*/

const CFG = {
  tablaBase: {
    nombre: "SP Kg",
    campos: {
      key: "SC",
      sc: "SC",
      sp: "SP",
      descripcion: "Descripción",
      kgUni: "Kg x Uni",
      kgCaj: "Kg x Caj",
      stockInicial: "Stock Inicial"
    }
  },

  enviosPS: {
    nombre: "Envios a PS",
    campoKey: "SC",
    campoCantidad: "Cantidad"
  },

  entregasPS: {
    nombre: "Entrega a PS",
    campoKey: "SC",
    campoCantidad: "Cantidad"
  },

  enviosTalleristas: {
    nombre: "Envios a Talleristas",
    campoKey: "SC",
    campoCantidad: "Cantidad"
  },

  entregasTalleristas: {
    nombre: "Entrega a Talleristas",
    campoKey: "SC",
    campoCantidad: "Cantidad"
  }
};

const tbodyStocksGeneral = document.getElementById("tbodyStocksGeneral");
const txtBuscar = document.getElementById("txtBuscar");
const selSoloConStock = document.getElementById("selSoloConStock");
const lblEstado = document.getElementById("lblEstado");
const btnRecargar = document.getElementById("btnRecargar");
const btnInicio = document.getElementById("btnInicio");

let rowsOriginal = [];
let rowsFiltradas = [];

function num(n) {
  if (n === null || n === undefined || n === "") return 0;
  if (typeof n === "number") return isNaN(n) ? 0 : n;

  const s = String(n).trim().replace(/\./g, "").replace(",", ".");
  const v = Number(s);
  return isNaN(v) ? 0 : v;
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

function safeCell(obj, key) {
  return obj && key in obj ? obj[key] : "";
}

function calcCaj(kg, kgCaj) {
  const a = num(kg);
  const b = num(kgCaj);
  if (!b) return 0;
  return a / b;
}

async function fetchTabla(nombre, columns = "*") {
  const { data, error } = await supabase
    .from(nombre)
    .select(columns);

  if (error) throw error;
  return data || [];
}

async function getMovimientosAgrupados({ nombre, campoKey, campoCantidad }) {
  if (!nombre) return {};

  const { data, error } = await supabase
    .from(nombre)
    .select(`${campoKey}, ${campoCantidad}`);

  if (error) {
    console.warn(`No se pudo leer ${nombre}:`, error.message);
    return {};
  }

  const out = {};

  for (const row of data || []) {
    const key = String(row[campoKey] || "").trim();
    if (!key) continue;
    out[key] = (out[key] || 0) + num(row[campoCantidad]);
  }

  return out;
}

function calcularFila(baseRow, agg) {
  const campos = CFG.tablaBase.campos;

  const key = String(safeCell(baseRow, campos.key) || "").trim();
  const sc = safeCell(baseRow, campos.sc);
  const sp = safeCell(baseRow, campos.sp);
  const descripcion = safeCell(baseRow, campos.descripcion);
  const kgUni = num(safeCell(baseRow, campos.kgUni));
  const kgCaj = num(safeCell(baseRow, campos.kgCaj));
  const stockInicial = num(safeCell(baseRow, campos.stockInicial));

  const envPS = num(agg.enviosPS[key]);
  const entPS = num(agg.entregasPS[key]);
  const envTall = num(agg.enviosTall[key]);
  const entTall = num(agg.entregasTall[key]);

  const stockSPUni = stockInicial + entPS - envTall;
  const stockPSUni = envPS - entPS;
  const stockTallUni = envTall - entTall;

  const stockSPKg = stockSPUni * kgUni;
  const stockPSKg = stockPSUni * kgUni;
  const stockTallKg = stockTallUni * kgUni;

  const stockSPCaj = calcCaj(stockSPKg, kgCaj);
  const stockPSCaj = calcCaj(stockPSKg, kgCaj);
  const stockTallCaj = calcCaj(stockTallKg, kgCaj);

  return {
    key,
    sc,
    sp,
    descripcion,
    stockInicial,
    kgUni,
    kgCaj,

    stockSPUni,
    stockSPKg,
    stockSPCaj,

    stockPSUni,
    stockPSKg,
    stockPSCaj,

    stockTallUni,
    stockTallKg,
    stockTallCaj
  };
}

function renderTable(rows) {
  if (!rows.length) {
    tbodyStocksGeneral.innerHTML = `
      <tr>
        <td colspan="16" class="empty">No se encontraron datos.</td>
      </tr>
    `;
    return;
  }

  tbodyStocksGeneral.innerHTML = rows.map(r => `
    <tr>
      <td class="text-center">${r.sc || ""}</td>
      <td class="text-center">${r.sp || ""}</td>
      <td class="text-left">${r.descripcion || ""}</td>

      <td class="text-right">${formatNumber(r.stockInicial)}</td>
      <td class="text-right">${formatKg(r.kgUni)}</td>
      <td class="text-right">${formatKg(r.kgCaj)}</td>
      <td class="text-right">${formatCaj(calcCaj(r.stockInicial * r.kgUni, r.kgCaj))}</td>

      <td class="text-right ${r.stockSPUni < 0 ? "negativo" : ""}">${formatNumber(r.stockSPUni)}</td>
      <td class="text-right ${r.stockSPKg < 0 ? "negativo" : ""}">${formatKg(r.stockSPKg)}</td>
      <td class="text-right ${r.stockSPCaj < 0 ? "negativo" : ""}">${formatCaj(r.stockSPCaj)}</td>

      <td class="text-right ${r.stockPSUni < 0 ? "negativo" : ""}">${formatNumber(r.stockPSUni)}</td>
      <td class="text-right ${r.stockPSKg < 0 ? "negativo" : ""}">${formatKg(r.stockPSKg)}</td>
      <td class="text-right ${r.stockPSCaj < 0 ? "negativo" : ""}">${formatCaj(r.stockPSCaj)}</td>

      <td class="text-right ${r.stockTallUni < 0 ? "negativo" : ""}">${formatNumber(r.stockTallUni)}</td>
      <td class="text-right ${r.stockTallKg < 0 ? "negativo" : ""}">${formatKg(r.stockTallKg)}</td>
      <td class="text-right ${r.stockTallCaj < 0 ? "negativo" : ""}">${formatCaj(r.stockTallCaj)}</td>
    </tr>
  `).join("");
}

function renderTotales(rows) {
  const t = rows.reduce((acc, r) => {
    acc.spUni += num(r.stockSPUni);
    acc.spKg += num(r.stockSPKg);
    acc.psUni += num(r.stockPSUni);
    acc.psKg += num(r.stockPSKg);
    acc.tallUni += num(r.stockTallUni);
    acc.tallKg += num(r.stockTallKg);
    return acc;
  }, {
    spUni: 0,
    spKg: 0,
    psUni: 0,
    psKg: 0,
    tallUni: 0,
    tallKg: 0
  });

  document.getElementById("totalSPUni").textContent = formatNumber(t.spUni);
  document.getElementById("totalSPKg").textContent = formatKg(t.spKg);
  document.getElementById("totalPSUni").textContent = formatNumber(t.psUni);
  document.getElementById("totalPSKg").textContent = formatKg(t.psKg);
  document.getElementById("totalTallUni").textContent = formatNumber(t.tallUni);
  document.getElementById("totalTallKg").textContent = formatKg(t.tallKg);
}

function aplicarFiltros() {
  const q = normalizeText(txtBuscar.value);
  const modo = selSoloConStock.value;

  rowsFiltradas = rowsOriginal.filter(r => {
    const texto = normalizeText(`${r.sc} ${r.sp} ${r.descripcion}`);
    const pasaTexto = !q || texto.includes(q);

    const totalAbs = Math.abs(num(r.stockSPUni)) + Math.abs(num(r.stockPSUni)) + Math.abs(num(r.stockTallUni));
    const tieneStock = totalAbs > 0;

    let pasaModo = true;
    if (modo === "conStock") pasaModo = tieneStock;
    if (modo === "sinStock") pasaModo = !tieneStock;

    return pasaTexto && pasaModo;
  });

  lblEstado.textContent = `Encontradas ${rowsFiltradas.length} filas`;
  renderTable(rowsFiltradas);
  renderTotales(rowsFiltradas);
}

async function cargarStocksGeneral() {
  try {
    lblEstado.textContent = "Cargando datos...";
    tbodyStocksGeneral.innerHTML = `
      <tr>
        <td colspan="16" class="empty">Cargando datos...</td>
      </tr>
    `;

    const [
      base,
      enviosPSAgg,
      entregasPSAgg,
      enviosTallAgg,
      entregasTallAgg
    ] = await Promise.all([
      fetchTabla(CFG.tablaBase.nombre),
      getMovimientosAgrupados(CFG.enviosPS),
      getMovimientosAgrupados(CFG.entregasPS),
      getMovimientosAgrupados(CFG.enviosTalleristas),
      getMovimientosAgrupados(CFG.entregasTalleristas)
    ]);

    const agg = {
      enviosPS: enviosPSAgg,
      entregasPS: entregasPSAgg,
      enviosTall: enviosTallAgg,
      entregasTall: entregasTallAgg
    };

    rowsOriginal = (base || []).map(row => calcularFila(row, agg));

    aplicarFiltros();
  } catch (err) {
    console.error(err);
    lblEstado.textContent = `Error: ${err.message || err}`;
    tbodyStocksGeneral.innerHTML = `
      <tr>
        <td colspan="16" class="empty">Error al cargar datos.</td>
      </tr>
    `;
  }
}

txtBuscar.addEventListener("input", aplicarFiltros);
selSoloConStock.addEventListener("change", aplicarFiltros);
btnRecargar.addEventListener("click", cargarStocksGeneral);

btnInicio.addEventListener("click", () => {
  window.location.href = "index.html";
});

document.addEventListener("DOMContentLoaded", cargarStocksGeneral);