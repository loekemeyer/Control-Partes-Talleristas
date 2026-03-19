const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/*************************************************
 * TABLA BASE
 *************************************************/
const TABLA_PARTES_SP = "Partes x PS";

const COL_PS = "PS";
const COL_PARTE = "Parte";
const COL_PROCESO = "Proceso";
const COL_SC = "SC";
const COL_SP = "SP";

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
let partesSPCache = null;
let psActivo = "";
let listaPS = [];

/*************************************************
 * HELPERS
 *************************************************/
function setStatus(t){
  statusEl.textContent = t || "";
}

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function pick(obj, keys){
  for (const k of keys){
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)){
      return obj[k];
    }
  }
  return undefined;
}

function normalizeText(value){
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function buildParteKey(ps, parte, proceso, sc, sp){
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
function renderPS(lista){
  talleristasGrid.innerHTML = "";

  lista.forEach(nombre => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tallerista-btn";
    btn.textContent = nombre;

    if (nombre === psActivo){
      btn.classList.add("active");
    }

    btn.addEventListener("click", () => seleccionarPS(nombre));
    talleristasGrid.appendChild(btn);
  });
}

function seleccionarPS(nombre){
  psActivo = nombre;
  renderPS([nombre]);
  btnVolver.classList.remove("hidden");
  buscar(nombre);
}

function volverALista(){
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
async function cargarPS(){
  setStatus("Cargando proveedores...");
  resultEl.innerHTML = "";

  const { data, error } = await supabaseClient
    .from(TABLA_PARTES_SP)
    .select(COL_PS)
    .limit(5000);

  if (error){
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
 * CARGA PARTES x PS
 *************************************************/
async function cargarPartesSP(){
  if (partesSPCache) return partesSPCache;

  const { data, error } = await supabaseClient
    .from(TABLA_PARTES_SP)
    .select("*")
    .limit(20000);

  if (error){
    console.error(error);
    throw new Error("Error al leer " + TABLA_PARTES_SP);
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

    partes.push({
      ps,
      parte,
      proceso,
      sc,
      sp,
      key
    });
  });

  partesSPCache = partes;
  return partesSPCache;
}

/*************************************************
 * BUSQUEDA PRINCIPAL
 *************************************************/
async function buscar(nombreParam){
  const nombre = String(nombreParam || "").trim();

  if (!nombre){
    setStatus("Seleccioná un proveedor");
    return;
  }

  resultEl.innerHTML = "";
  setStatus("Buscando...");

  let partesSP;

  try{
    partesSP = await cargarPartesSP();
  }catch (err){
    console.error(err);
    setStatus(err.message || "Error al cargar datos");
    return;
  }

  const filasPS = partesSP
    .filter(x => x.ps === nombre)
    .sort((a, b) => {
      const pa = String(a.proceso || "");
      const pb = String(b.proceso || "");
      if (pa !== pb) return pa.localeCompare(pb, "es");
      return String(a.parte || "").localeCompare(String(b.parte || ""), "es");
    });

  if (!filasPS.length){
    setStatus("No encontré partes para este proveedor");
    resultEl.innerHTML = "";
    return;
  }

  let rows = "";

  filasPS.forEach(item => {
rows += `
  <tr>
    <td class="center">${item.sc ? escapeHtml(item.sc) : '<span class="zero">-</span>'}</td>
    <td class="center">${item.sp ? escapeHtml(item.sp) : '<span class="zero">-</span>'}</td>
    <td>${escapeHtml(item.parte)}</td>

    <td class="right"><b>${escapeHtml(formatDecimal(onlineKg))}</b></td>
    <td class="right"><b>${escapeHtml(formatCajones(onlineCaj))}</b></td>
    <td class="right"><b>${escapeHtml(formatNumber(onlineUni))}</b></td>

    <td class="right"><b>${escapeHtml(formatCajones(cajonesEnviar))}</b></td>

    <td class="center">
      <div class="cell-combo">
        <span class="cell-total">${escapeHtml(formatNumber(totalEnviosUni))}</span>
        <button type="button" class="mini-popup-btn">+</button>
      </div>
    </td>

    <td class="center">
      <div class="cell-combo">
        <span class="cell-total">${escapeHtml(formatNumber(totalEntregasUni))}</span>
        <button type="button" class="mini-popup-btn">+</button>
      </div>
    </td>

    <td class="right"><b>${escapeHtml(formatDecimal(stockInicialKg))}</b></td>
    <td class="right"><b>${escapeHtml(formatDecimal(kgXUni))}</b></td>
    <td class="right"><b>${escapeHtml(formatDecimal(kgXCajon))}</b></td>
  </tr>
`;

  setStatus(`Encontradas ${filasPS.length} partes`);

  resultEl.innerHTML = `
  <div class="articulo">
    <div class="articulo-header">${escapeHtml(nombre)}</div>
    <table class="table">
      <thead>
        <tr>
          <th colspan="3">Base</th>
          <th colspan="3" class="right">Online</th>
          <th colspan="1" class="right">Enviar</th>
          <th colspan="2" class="center">Movimientos (Uni)</th>
          <th colspan="3" class="right">Info</th>
        </tr>
        <tr>
          <th>SC</th>
          <th>SP</th>
          <th>Descripción</th>

          <th class="right">Kg</th>
          <th class="right">Caj</th>
          <th class="right">Uni</th>

          <th class="right">Cjn a Env</th>

          <th class="center">Envíos</th>
          <th class="center">Entregas</th>

          <th class="right">Stock<br>Inicial</th>
          <th class="right">Kg x<br>Uni</th>
          <th class="right">Kg x<br>Cajón</th>
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

/*************************************************
 * INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  cargarPS();
});
