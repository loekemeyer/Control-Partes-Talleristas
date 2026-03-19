"use strict";

/***********************
 * CONFIG
 ***********************/
const SUCURSAL = "Cerv";

const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";
const TABLA_DESTINO = "Envios a PS";

const SUPABASE_TABLE = "Partes x PS";
const COL_PS = "PS";
const COL_PROCESO = "Proceso";
const COL_PARTE = "Parte";
const COL_SC = "SC";
const COL_SP = "SP";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/***********************
 * DOM
 ***********************/
const statusEl = document.getElementById("status");
const psGridWrap = document.getElementById("psGridWrap");
const psGrid = document.getElementById("psGrid");

const selectedBar = document.getElementById("selectedBar");
const selectedBadge = document.getElementById("selectedBadge");
const btnVolver = document.getElementById("btnVolver");
const btnEnviarCambios = document.getElementById("btnEnviarCambios");

const detailWrap = document.getElementById("detailWrap");
const resultBody = document.getElementById("resultBody");
const tableTitle = document.getElementById("tableTitle");
const tableMsg = document.getElementById("tableMsg");

const successBox = document.getElementById("successBox");
const successCodeEl = document.getElementById("successCode");
const okBtn = document.getElementById("okBtn");

/***********************
 * STATE
 ***********************/
let availablePS = [];
let selectedPS = "";
let fetchedItems = [];
let isSubmitting = false;
let lastSendCode = null;

/***********************
 * HELPERS
 ***********************/
function uniqueSorted(arr) {
  return [...new Set(arr.map(v => String(v || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function arDateISO() {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(new Date());
}

function genNumericCode(len = 4) {
  const min = Math.pow(10, len - 1);
  const max = Math.pow(10, len) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

function showSuccess(code) {
  successCodeEl.textContent = code;
  successBox.style.display = "block";
}

function hideSuccess() {
  successBox.style.display = "none";
  successCodeEl.textContent = "—";
}

function setStatus(text, type = "") {
  statusEl.className = "status" + (type ? ` ${type}` : "");
  statusEl.textContent = text;
}

function setTableMsg(text, type = "") {
  tableMsg.className = "status" + (type ? ` ${type}` : "");
  tableMsg.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/***********************
 * DATA
 ***********************/
async function getPSDisponibles() {
  const { data, error } = await sb
    .from(SUPABASE_TABLE)
    .select(COL_PS);

  if (error) throw error;
  return uniqueSorted((data || []).map(r => r[COL_PS]));
}

async function getItemsPorPS(ps) {
  const { data, error } = await sb
    .from(SUPABASE_TABLE)
    .select(`${COL_PS}, ${COL_PROCESO}, ${COL_PARTE}, ${COL_SC}, ${COL_SP}`)
    .eq(COL_PS, ps)
    .order(COL_PROCESO, { ascending: true })
    .order(COL_PARTE, { ascending: true });

  if (error) throw error;

  const uniques = [];
  const seen = new Set();

  (data || []).forEach(r => {
    const parte = String(r[COL_PARTE] || "").trim();
    const proceso = String(r[COL_PROCESO] || "").trim();
    const psVal = String(r[COL_PS] || "").trim();
    const sc = String(r[COL_SC] || "").trim();
    const sp = String(r[COL_SP] || "").trim();

    if (!parte) return;

    const key = [parte, proceso, sc, sp].join("||");
    if (seen.has(key)) return;

    seen.add(key);
    uniques.push({
      ps: psVal,
      proceso,
      parte,
      sc,
      sp
    });
  });

  return uniques;
}

/***********************
 * UI
 ***********************/
function renderPSButtons(values) {
  psGrid.innerHTML = "";

  values.forEach(ps => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ps-pill";
    btn.textContent = ps;

    btn.addEventListener("click", async () => {
      if (isSubmitting) return;
      await seleccionarPS(ps);
    });

    psGrid.appendChild(btn);
  });
}

function renderTable(items) {
  resultBody.innerHTML = "";

  if (!items.length) {
    resultBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center;color:#b42318;font-weight:700;">
          No hay partes para este proveedor.
        </td>
      </tr>
    `;
    return;
  }

  const rows = items.map((item, i) => {
    return `
      <tr data-idx="${i}">
        <td>${escapeHtml(item.parte)}</td>
        <td>${escapeHtml(item.proceso)}</td>
        <td>${escapeHtml(item.sc)}</td>
        <td>${escapeHtml(item.sp)}</td>
        <td>
  <input
    class="input-kg"
    type="text"
    inputmode="decimal"
    placeholder="0,0"
    data-role="kg"
    data-idx="${i}"
  />
</td>

<td>
  <input
    class="input-caj"
    type="text"
    inputmode="numeric"
    placeholder="0"
    data-role="cajones"
    data-idx="${i}"
  />
</td>
      </tr>
    `;
  }).join("");

  resultBody.innerHTML = rows;

  resultBody.querySelectorAll('input[data-role="cajones"]').forEach(input => {
    input.addEventListener("input", () => {
      input.value = input.value.replace(/\D/g, "");
      updateEnviarState();
    });
  });
  // KG → permite coma y decimal
resultBody.querySelectorAll('input[data-role="kg"]').forEach(input => {
  input.addEventListener("input", () => {
    input.value = input.value
      .replace(/[^0-9,]/g, "")   // solo números y coma
      .replace(/(,.*),/g, '$1'); // solo una coma
    updateEnviarState();
  });
});
}

function showSelectionView() {
  psGridWrap.classList.remove("hidden");
  detailWrap.classList.add("hidden");
  selectedBar.classList.add("hidden");
  btnEnviarCambios.classList.add("hidden");
}

function showDetailView() {
  psGridWrap.classList.add("hidden");
  detailWrap.classList.remove("hidden");
  selectedBar.classList.remove("hidden");
  btnEnviarCambios.classList.remove("hidden");
}

function updateEnviarState() {
  const items = getItemsFromTable();
  const filtered = filterItemsToSend(items);
  const enabled = !isSubmitting && selectedPS && filtered.length > 0;

  btnEnviarCambios.classList.toggle("enabled", enabled);
}

function resetAll() {
  selectedPS = "";
  fetchedItems = [];
  isSubmitting = false;
  lastSendCode = null;

  selectedBadge.textContent = "";
  tableTitle.textContent = "Proveedor";
  resultBody.innerHTML = "";
  setTableMsg("");

  hideSuccess();
  showSelectionView();
  setStatus("Seleccioná un proveedor para continuar.", "bad");
  updateEnviarState();

  psGrid.querySelectorAll(".ps-pill").forEach(btn => {
    btn.classList.remove("active");
  });
}

async function seleccionarPS(ps) {
  selectedPS = ps;
  fetchedItems = [];
  hideSuccess();

  psGrid.querySelectorAll(".ps-pill").forEach(btn => {
    btn.classList.toggle("active", btn.textContent.trim() === ps);
  });

  setStatus("Buscando partes...", "");

  try {
    fetchedItems = await getItemsPorPS(ps);

    selectedBadge.textContent = ps;
    tableTitle.textContent = ps;

    renderTable(fetchedItems);
    showDetailView();

    if (fetchedItems.length) {
      setStatus("Proveedor cargado correctamente.", "ok");
      setTableMsg("Completá KG y Cajones. Si cargás uno, debés completar ambos.");
    } else {
      setStatus("No hay partes para ese proveedor.", "bad");
      setTableMsg("No hay partes para ese proveedor.", "bad");
    }

    updateEnviarState();
  } catch (e) {
    console.error(e);
    setStatus("Error consultando partes.", "bad");
    setTableMsg("Error consultando partes.", "bad");
  }
}

/***********************
 * TABLE DATA
 ***********************/
function parseInputNumber(value) {
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const n = Number(normalized);

  return Number.isFinite(n) ? n : null;
}

function getItemsFromTable() {
  return fetchedItems.map((item, i) => {
    const cajInput = resultBody.querySelector(`input[data-role="cajones"][data-idx="${i}"]`);
    const kgInput = resultBody.querySelector(`input[data-role="kg"][data-idx="${i}"]`);

    const cajones = parseInputNumber(cajInput?.value);
    const kg = parseInputNumber(kgInput?.value);

    return {
      ps: item.ps,
      proceso: item.proceso,
      parte: item.parte,
      sc: item.sc,
      sp: item.sp,
      cajones: cajones ?? 0,
      kg: kg ?? 0
    };
  });
}

function filterItemsToSend(items) {
  return items.filter(it => {
    const caj = Number(it.cajones || 0);
    const kg = Number(it.kg || 0);
    return caj > 0 && kg > 0;
  });
}
function getDiaMesHoy() {
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, "0");
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

/***********************
 * EVENTS
 ***********************/
btnVolver.addEventListener("click", () => {
  if (isSubmitting) return;
  resetAll();
});

okBtn.addEventListener("click", () => {
  resetAll();
});



btnEnviarCambios.addEventListener("click", async () => {
  if (isSubmitting) return;

  const rawItems = getItemsFromTable();

if (!selectedPS) {
  setTableMsg("Seleccioná un proveedor.", "bad");
  return;
}

// ❌ 1. Todo vacío
const todosVacios = rawItems.every(it => {
  const caj = Number(it.cajones || 0);
  const kg = Number(it.kg || 0);
  return caj === 0 && kg === 0;
});

if (todosVacios) {
  setTableMsg("Completá al menos una fila con KG y Cajones.", "bad");
  return;
}

// ❌ 2. Hay filas incompletas
const hayIncompletos = rawItems.some(it => {
  const caj = Number(it.cajones || 0);
  const kg = Number(it.kg || 0);

  return (caj > 0 && kg === 0) || (kg > 0 && caj === 0);
});

if (hayIncompletos) {
  setTableMsg("Si cargás KG o Cajones, debés completar ambos.", "bad");
  return;
}

// ✅ 3. Solo filas válidas
const items = rawItems.filter(it => {
  const caj = Number(it.cajones || 0);
  const kg = Number(it.kg || 0);
  return caj > 0 && kg > 0;
});

  const detalle = items
    .map(it => `${it.parte} - ${it.proceso} - SC ${it.sc} - SP ${it.sp} - KG ${it.kg || 0} - Caj ${it.cajones || 0}`)
    .join("\n");

  const ok = confirm(`¿Está seguro con las cantidades?\n\n${detalle}`);
  if (!ok) return;

  const payload = items.map(it => ({
    "Dia-mes": getDiaMesHoy(),
    "Prov_Serv": selectedPS,
    "Sector SC": it.sc || "",
    "Parte": it.parte || "",
    "Faltante": false,
    "KG": Number(it.kg || 0),
    "Cajones": Number(it.cajones || 0),
    "Sector SP": it.sp || "",
    "Proceso": it.proceso || ""
  }));

  try {
    isSubmitting = true;
    btnEnviarCambios.disabled = true;
    btnEnviarCambios.classList.remove("enabled");

    setTableMsg("Guardando en base de datos...", "");
    setStatus("Guardando en base de datos...", "");

    const { error } = await sb
      .from(TABLA_DESTINO)
      .insert(payload);

    if (error) throw error;

    isSubmitting = false;
    btnEnviarCambios.disabled = false;

    setStatus("Enviado correctamente.", "ok");
    setTableMsg("Enviado correctamente.", "ok");

    const codigo = genNumericCode(4);
    lastSendCode = codigo;
    showSuccess(codigo);
  } catch (e) {
    isSubmitting = false;
    btnEnviarCambios.disabled = false;
    updateEnviarState();

    console.error(e);
    setTableMsg("Error enviando: " + (e?.message || e), "bad");
    setStatus("Error guardando en base.", "bad");
  }
});

/***********************
 * INIT
 ***********************/
async function init() {
  try {
    setStatus("Cargando proveedores...", "");
    availablePS = await getPSDisponibles();

    renderPSButtons(availablePS);
    psGridWrap.classList.remove("hidden");

    if (availablePS.length) {
      setStatus("Seleccioná un proveedor para continuar.", "bad");
    } else {
      setStatus("No se encontraron proveedores.", "bad");
    }
  } catch (e) {
    console.error(e);
    setStatus("No se pudieron cargar los proveedores.", "bad");
  }
}

showSelectionView();
init();
