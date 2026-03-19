alert("VERSION NUEVA CONTROL PS - SIN CACHE");
const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/*************************************************
 * TABLA BASE
 *************************************************/
const TABLA_PARTES_PS = "Partes x PS";

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
let partesPSCache = null;
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

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      return obj[k];
    }
  }
  return undefined;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
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
 * CARGA PARTES x PS
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

    partes.push({
      ps,
      parte,
      proceso,
      sc,
      sp,
      key
    });
  });

  partesPSCache = partes;
  return partesPSCache;
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

  let partesPS;

  try {
    partesPS = await cargarPartesPS();
  } catch (err) {
    console.error(err);
    setStatus(err.message || "Error al cargar datos");
    return;
  }

  const filasPS = partesPS
    .filter(x => x.ps === nombre)
    .sort((a, b) => {
      const scA = String(a.sc || "");
      const scB = String(b.sc || "");
      if (scA !== scB) return scA.localeCompare(scB, "es");

      const spA = String(a.sp || "");
      const spB = String(b.sp || "");
      if (spA !== spB) return spA.localeCompare(spB, "es");

      const parteA = String(a.parte || "");
      const parteB = String(b.parte || "");
      if (parteA !== parteB) return parteA.localeCompare(parteB, "es");

      return String(a.proceso || "").localeCompare(String(b.proceso || ""), "es");
    });

  if (!filasPS.length) {
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
        <td>${item.proceso ? escapeHtml(item.proceso) : '<span class="zero">Sin proceso</span>'}</td>
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
            <th>SC</th>
            <th>SP</th>
            <th>Descripción</th>
            <th>Proceso</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

/*************************************************
 * INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  cargarPS();
});
