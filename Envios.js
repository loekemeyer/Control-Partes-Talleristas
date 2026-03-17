/*************************************************
 * CONFIGURACIÓN SUPABASE
 *************************************************/
const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/*************************************************
 * ELEMENTOS DEL DOM
 *************************************************/
const talleristasGrid = document.getElementById("talleristasGrid");
const resultEl = document.getElementById("result");
const btnVolver = document.getElementById("btnVolver");
const btnEnviarCambios = document.getElementById("btnEnviarCambios");
const TABLA_DESTINO = "Envios a Talleristas";
const filasModificadas = new Map();
/*************************************************
 * CACHES EN MEMORIA
 *************************************************/
let consumosCache = null;
let sectoresCache = null;
let stockTalleristaCache = null;

let talleristaActivo = "";
let listaTalleristas = [];

/*************************************************
 * HELPERS VISUALES
 *************************************************/


function escapeHtml(s){
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatDecimal(n){
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function parseInputNumber(value){
  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const normalized = raw.replace(",", ".");
  const n = Number(normalized);

  return Number.isFinite(n) ? n : null;
}

/*************************************************
 * HELPERS DE DATOS
 *************************************************/
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

function normalizeCode(value){
  if (value === null || value === undefined) return "";

  let raw = String(value).trim();
  if (!raw) return "";
  if (/[a-zA-Z]/.test(raw)) return "";

  raw = raw.replace(",", ".");

  const num = Number(raw);
  if (Number.isFinite(num)){
    return String(Math.trunc(num)).padStart(3, "0");
  }

  raw = raw.replace(/\s+/g, "");
  raw = raw.replace(/[.,]0+$/, "");

  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";

  return digits.padStart(3, "0");
}

function splitCodes(value){
  return String(value || "")
    .split(",")
    .map(x => normalizeCode(x))
    .filter(Boolean);
}

function parseConsumo(value){
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number"){
    return Number.isFinite(value) ? value : 0;
  }

  let s = String(value).trim();
  if (!s || s === "-" || s === "—") return 0;

  s = s.replace(/[^\d,.-]/g, "");

  if (s.includes(",")){
    s = s.replace(/,/g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function parseDecimal(value){
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number"){
    return Number.isFinite(value) ? value : 0;
  }

  let s = String(value).trim();
  if (!s || s === "-" || s === "—") return 0;

  s = s.replace(/[^\d,.-]/g, "");

  if (s.includes(",") && !s.includes(".")){
    s = s.replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function elegirConsumo(ch, lk){
  const a = Number(ch || 0);
  const b = Number(lk || 0);

  if (a > 0 && b === 0) return a;
  if (b > 0 && a === 0) return b;
  if (a > 0 && b > 0) return Math.max(a, b);
  return 0;
}

/*************************************************
 * RENDER DE BOTONES DE TALLERISTAS
 *************************************************/
function renderTalleristas(lista){
  talleristasGrid.innerHTML = "";

  lista.forEach(nombre => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tallerista-btn";
    btn.textContent = nombre;

    if (nombre === talleristaActivo){
      btn.classList.add("active");
    }

    btn.addEventListener("click", () => seleccionarTallerista(nombre));
    talleristasGrid.appendChild(btn);
  });
}

function seleccionarTallerista(nombre){
  talleristaActivo = nombre;
  renderTalleristas([nombre]);
  btnVolver.classList.remove("hidden");
  buscar(nombre);
}

async function volverALista(){
  if (filasModificadas.size > 0){
    const quiereEnviar = confirm(
      "No presionaste Enviar.\n\nAceptar = Enviar cambios ahora\nCancelar = Ver más opciones"
    );

    if (quiereEnviar){
      await enviarCambios(true);
      return;
    }

    const quiereBorrar = confirm(
      "Tenés cambios sin enviar.\n\nAceptar = Borrar todo lo hecho\nCancelar = Volver atrás"
    );

    if (!quiereBorrar){
      return;
    }

    filasModificadas.clear();

    if (btnEnviarCambios){
      btnEnviarCambios.classList.add("hidden");
      btnEnviarCambios.disabled = false;
      btnEnviarCambios.textContent = "Enviar";
    }
  }

  talleristaActivo = "";
  resultEl.innerHTML = "";
  btnVolver.classList.add("hidden");
  renderTalleristas(listaTalleristas);
}

btnVolver.addEventListener("click", volverALista);

/*************************************************
 * CARGA LISTA DE TALLERISTAS
 *************************************************/
async function cargarTalleristas(){
  resultEl.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("v_piezas_por_tallerista_resumen")
    .select("*")
    .limit(5000);

  if (error){
    console.error("Error al cargar talleristas:", error);
    return;
  }

  listaTalleristas = [...new Set(
    (data || [])
      .map(r => String(pick(r, ["Tallerista", "tallerista", "TALLERISTA"]) || "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "es"));

  renderTalleristas(listaTalleristas);
}

/*************************************************
 * CARGA CONSUMOS DESDE E. MADRE CH / LK
 *************************************************/
async function cargarConsumos(){
  if (consumosCache) return consumosCache;

  const [respCH, respLK] = await Promise.all([
    supabaseClient.from("E. Madre CH").select("*").limit(10000),
    supabaseClient.from("E. Madre LK").select("*").limit(10000)
  ]);

  if (respCH.error){
    console.error(respCH.error);
    throw new Error("Error al leer E. Madre CH");
  }

  if (respLK.error){
    console.error(respLK.error);
    throw new Error("Error al leer E. Madre LK");
  }

  const mapCH = new Map();
  const mapLK = new Map();
  const finalMap = new Map();

  function cargarEnMapa(rows, mapDestino){
    (rows || []).forEach(r => {
      const codRaw =
        r.Cod ??
        r.cod ??
        r.COD ??
        r.codigo ??
        r["Cod"] ??
        r["COD"];

      const consumoRaw =
        r["E. Madre"] ??
        r["E_Madre"] ??
        r["e_madre"] ??
        r["e madre"] ??
        r["E_MADRE"] ??
        r.consumo;

      const cod = normalizeCode(codRaw);
      const consumo = parseConsumo(consumoRaw);

      if (!cod) return;
      mapDestino.set(cod, consumo);
    });
  }

  cargarEnMapa(respCH.data, mapCH);
  cargarEnMapa(respLK.data, mapLK);

  const todosLosCodigos = new Set([
    ...mapCH.keys(),
    ...mapLK.keys()
  ]);

  todosLosCodigos.forEach(cod => {
    finalMap.set(cod, elegirConsumo(mapCH.get(cod), mapLK.get(cod)));
  });

  consumosCache = finalMap;
  return finalMap;
}

/*************************************************
 * CARGA DATOS DE DESPIECE
 *************************************************/
async function cargarSectores(){
  if (sectoresCache) return sectoresCache;

  const { data, error } = await supabaseClient
    .from("Despiece x Articulo")
    .select("*")
    .limit(20000);

  if (error){
    console.error(error);
    throw new Error("Error al leer Despiece x Articulo");
  }

  const mapByCodeAndPart = new Map();
  const mapByPart = new Map();

  const kgXCajonByCodeAndPart = new Map();
  const kgXCajonByPart = new Map();

  const kgXUniByCodeAndPart = new Map();
  const kgXUniByPart = new Map();

  const partesXUniByCodeAndPart = new Map();
  const partesXUniByPart = new Map();

  (data || []).forEach(r => {
    const cod = normalizeCode(pick(r, ["COD", "Cod", "cod"]));
    const parte = normalizeText(pick(r, ["Descripcion de partes", "Descripción de partes", "descripcion de partes"]));
    const sector = String(pick(r, ["Sector Proce", "sector proce", "Sector_Proce"]) || "").trim();

    const kgXCajon = parseDecimal(pick(r, ["Kg x Caj", "KG x Caj", "kg x caj", "Kg x caja", "kg x caja"]));
    const kgXUni = parseDecimal(pick(r, ["KGxUni", "KGxUNI", "KgxUni", "KgXUni", "kgxuni", "KG x Uni", "Kg x Uni", "kg x uni"]));
    const partesXUni = parseDecimal(pick(r, ["Partes x uni", "Partes x Uni", "partes x uni", "PartesXUni"]));

    if (!parte) return;

    if (!mapByPart.has(parte)) mapByPart.set(parte, new Set());
    if (sector) mapByPart.get(parte).add(sector);

    if (cod && sector){
      const key = `${cod}__${parte}`;
      if (!mapByCodeAndPart.has(key)) mapByCodeAndPart.set(key, sector);
    }

    if (cod){
      const key = `${cod}__${parte}`;

      if (!kgXCajonByCodeAndPart.has(key)) kgXCajonByCodeAndPart.set(key, kgXCajon);
      if (!kgXUniByCodeAndPart.has(key)) kgXUniByCodeAndPart.set(key, kgXUni);
      if (!partesXUniByCodeAndPart.has(key)) partesXUniByCodeAndPart.set(key, partesXUni);
    }

    if (!kgXCajonByPart.has(parte)) kgXCajonByPart.set(parte, kgXCajon);
    if (!kgXUniByPart.has(parte)) kgXUniByPart.set(parte, kgXUni);
    if (!partesXUniByPart.has(parte)) partesXUniByPart.set(parte, partesXUni);
  });

  sectoresCache = {
    mapByCodeAndPart,
    mapByPart,
    kgXCajonByCodeAndPart,
    kgXCajonByPart,
    kgXUniByCodeAndPart,
    kgXUniByPart,
    partesXUniByCodeAndPart,
    partesXUniByPart
  };

  return sectoresCache;
}

/*************************************************
 * CARGA STOCK ONLINE DESDE ARTICULOS VIRGILIO X TALLERISTA
 *************************************************/
async function cargarStockTallerista(){
  if (stockTalleristaCache) return stockTalleristaCache;

  const { data, error } = await supabaseClient
    .from("Articulos Virgilio X Tallerista")
    .select("*")
    .limit(20000);

  if (error){
    console.error(error);
    throw new Error("Error al leer Articulos Virgilio X Tallerista");
  }

  const stockByTalleristaAndCode = new Map();

  (data || []).forEach(r => {
    const tallerista = normalizeText(pick(r, ["Tallerista", "tallerista", "TALLERISTA"]));
    const cod = normalizeCode(pick(r, ["Cod_Art", "Cod Art", "cod_art", "cod_articulo", "Cod"]));
    const stock = parseDecimal(pick(r, ["Stock Online", "stock online", "Stock_Online", "stock_online"]));

    if (!tallerista || !cod) return;

    const key = `${tallerista}__${cod}`;
    stockByTalleristaAndCode.set(key, (stockByTalleristaAndCode.get(key) || 0) + stock);
  });

  stockTalleristaCache = stockByTalleristaAndCode;
  return stockTalleristaCache;
}

/*************************************************
 * HELPERS DE CÁLCULO
 *************************************************/
function obtenerSectorProce(descripcion, codigos, sectoresData){
  const parteNorm = normalizeText(descripcion);
  if (!parteNorm) return "";

  const { mapByCodeAndPart, mapByPart } = sectoresData;
  const sectoresEncontrados = new Set();

  for (const cod of codigos){
    const key = `${cod}__${parteNorm}`;
    const sector = mapByCodeAndPart.get(key);
    if (sector) sectoresEncontrados.add(sector);
  }

  if (sectoresEncontrados.size){
    return [...sectoresEncontrados].join(" / ");
  }

  if (mapByPart.has(parteNorm)){
    return [...mapByPart.get(parteNorm)].join(" / ");
  }

  return "";
}

function obtenerKgXCajon(descripcion, codigos, sectoresData){
  const parteNorm = normalizeText(descripcion);
  if (!parteNorm) return 0;

  const { kgXCajonByCodeAndPart, kgXCajonByPart } = sectoresData;

  for (const cod of codigos){
    const key = `${cod}__${parteNorm}`;
    if (kgXCajonByCodeAndPart.has(key)) return Number(kgXCajonByCodeAndPart.get(key) || 0);
  }

  return Number(kgXCajonByPart.get(parteNorm) || 0);
}

function obtenerKgXUni(descripcion, codigos, sectoresData){
  const parteNorm = normalizeText(descripcion);
  if (!parteNorm) return 0;

  const { kgXUniByCodeAndPart, kgXUniByPart } = sectoresData;

  for (const cod of codigos){
    const key = `${cod}__${parteNorm}`;
    if (kgXUniByCodeAndPart.has(key)) return Number(kgXUniByCodeAndPart.get(key) || 0);
  }

  return Number(kgXUniByPart.get(parteNorm) || 0);
}

function obtenerPartesXUni(descripcion, codigos, sectoresData){
  const parteNorm = normalizeText(descripcion);
  if (!parteNorm) return 0;

  const { partesXUniByCodeAndPart, partesXUniByPart } = sectoresData;

  for (const cod of codigos){
    const key = `${cod}__${parteNorm}`;
    if (partesXUniByCodeAndPart.has(key)) return Number(partesXUniByCodeAndPart.get(key) || 0);
  }

  return Number(partesXUniByPart.get(parteNorm) || 0);
}

function obtenerStockOnlineTallerista(nombreTallerista, codigos, stockMap){
  const talleristaNorm = normalizeText(nombreTallerista);
  if (!talleristaNorm) return 0;

  let total = 0;

  for (const cod of codigos){
    const key = `${talleristaNorm}__${cod}`;
    total += Number(stockMap.get(key) || 0);
  }

  return total;
}

function calcularCajones(consumoTotal, kgXUni, partesXUni, kgXCajon){
  const consumo = Number(consumoTotal || 0);
  const uni = Number(kgXUni || 0);
  const partes = Number(partesXUni || 0);
  const caj = Number(kgXCajon || 0);

  if (caj <= 0 || consumo <= 0 || uni <= 0 || partes <= 0) return 0;

  return (consumo * uni * partes) / caj;
}

/*************************************************
 * LÓGICA FALTANTE
 *************************************************/
function actualizarFaltanteRow(row, esInicial = false){
  const esperado = Number(row.dataset.cajonesEsperados || 0);

  const inputCaj = row.querySelector(".input-caj");
  const inputKg = row.querySelector('input[name^="kg_"]');
  const box = row.querySelector(".faltante-box");

  if (!inputCaj || !box) return;

  const cargadoCaj = parseInputNumber(inputCaj.value);
  const cargadoKg = parseInputNumber(inputKg?.value);

  const sinCarga =
    (cargadoCaj === null || cargadoCaj === 0) &&
    (cargadoKg === null || cargadoKg === 0);

  // 🚫 IMPORTANTE: NO auto-F en carga inicial
  if (!esInicial && sinCarga && esperado <= 0.4){
    box.classList.add("active");
    box.textContent = "F";
    registrarCambioFila(row);
    return;
  }

  if (cargadoCaj === null){
    box.classList.remove("active");
    box.textContent = "";
    if (!esInicial) registrarCambioFila(row);
    return;
  }

  if (cargadoCaj < esperado){
    box.classList.add("active");
    box.textContent = "F";
  } else {
    box.classList.remove("active");
    box.textContent = "";
  }

  if (!esInicial) registrarCambioFila(row);
}

function activarLogicaFaltante(){
  resultEl.querySelectorAll("tbody tr").forEach(row => {
    const inputKg = row.querySelector(".input-kg");
    const inputCaj = row.querySelector(".input-caj");
    const box = row.querySelector(".faltante-box");

    if (inputKg){
      inputKg.addEventListener("input", () => {
        inputKg.value = inputKg.value.replace(/[^0-9,.\-]/g, "");
        registrarCambioFila(row);
      });
      inputKg.addEventListener("change", () => registrarCambioFila(row));
    }

    if (inputCaj){
      inputCaj.addEventListener("input", () => {
        inputCaj.value = inputCaj.value.replace(/[^\d]/g, "");
        actualizarFaltanteRow(row,true);
      });
      inputCaj.addEventListener("change", () => actualizarFaltanteRow(row));
    }

    if (box){
      box.addEventListener("click", () => {
        box.classList.toggle("active");
        box.textContent = box.classList.contains("active") ? "F" : "";
        registrarCambioFila(row);
      });
    }

    actualizarFaltanteRow(row,true);
  });
}

/*************************************************
 * BÚSQUEDA PRINCIPAL
 *************************************************/
async function buscar(nombreParam){
  const nombre = String(nombreParam || "").trim();
  if (!nombre) return;

  filasModificadas.clear();
  btnEnviarCambios.classList.add("hidden");
  btnEnviarCambios.disabled = false;
  btnEnviarCambios.textContent = "Enviar cambios";

  resultEl.innerHTML = "";

  const { data, error } = await supabaseClient
    .from("v_piezas_por_tallerista_resumen")
    .select("*")
    .limit(5000);

  if (error){
    console.error("Error al buscar:", error);
    return;
  }

  const filasTallerista = (data || []).filter(r => {
    const t = String(pick(r, ["Tallerista", "tallerista", "TALLERISTA"]) || "").trim();
    return t === nombre;
  });

  if (!filasTallerista.length){
    resultEl.innerHTML = `
      <div class="articulo">
        <div class="articulo-header">${escapeHtml(nombre)}</div>
        <div class="empty-state">No hay artículos con cajones a enviar mayores a 0.</div>
      </div>
    `;
    return;
  }

  let consumoMap, sectoresData, stockMap;

  try{
    [consumoMap, sectoresData, stockMap] = await Promise.all([
      cargarConsumos(),
      cargarSectores(),
      cargarStockTallerista()
    ]);
  }catch (err){
    console.error(err);
    return;
  }

  const filasFiltradas = [];

  filasTallerista.forEach(r => {
    const descripcion = String(pick(r, ["pieza", "Pieza", "PIEZA"]) || "").trim();
    const codsRaw = String(pick(r, ["cod_articulos", "Cod_articulos", "COD_ARTICULOS"]) || "");
    const codigos = splitCodes(codsRaw);

    if (!descripcion || !codigos.length) return;

    const sectorProce = obtenerSectorProce(descripcion, codigos, sectoresData);
    const kgXCajon = obtenerKgXCajon(descripcion, codigos, sectoresData);
    const kgXUni = obtenerKgXUni(descripcion, codigos, sectoresData);
    const partesXUni = obtenerPartesXUni(descripcion, codigos, sectoresData);

    let consumoTotal = 0;
    codigos.forEach(cod => {
      consumoTotal += Number(consumoMap.get(cod) || 0);
    });

    const maxCajones = calcularCajones(consumoTotal, kgXUni, partesXUni, kgXCajon);

    const stockOnlineUni = obtenerStockOnlineTallerista(nombre, codigos, stockMap);
    const stockOnlineKg = stockOnlineUni * kgXUni;
    const stockOnlineCaj = kgXCajon > 0 ? (stockOnlineKg / kgXCajon) : 0;

    const onlineUni = kgXUni > 0
  ? (stockInicialKg / kgXUni) + totalEnviosUni - totalEntregasUni
  : 0;

const onlineKg = onlineUni * kgXUni;

const onlineCaj = kgXCajon > 0
  ? (onlineKg / kgXCajon)
  : 0;

const cajonesEnviar = maxCajones - onlineCaj;

    if (cajonesEnviar > 0){
      filasFiltradas.push({
        tallerista: nombre,
        sector: sectorProce,
        descripcion,
        cajonesEnviar
      });
    }
  });

  filasFiltradas.sort((a, b) => {
    const sa = String(a.sector || "");
    const sb = String(b.sector || "");
    if (sa !== sb) return sa.localeCompare(sb, "es");
    return String(a.descripcion || "").localeCompare(String(b.descripcion || ""), "es");
  });

  let rows = "";

  filasFiltradas.forEach((item, index) => {
    rows += `
      <tr
        data-tallerista="${escapeHtml(item.tallerista)}"
        data-sector="${escapeHtml(item.sector || "")}"
        data-descripcion="${escapeHtml(item.descripcion)}"
        data-cajones-esperados="${Number(item.cajonesEnviar)}"
      >
        <td>${item.sector ? escapeHtml(item.sector) : '<span class="zero">Sin sector</span>'}</td>
        <td class="descripcion-cell">${escapeHtml(item.descripcion)}</td>
        <td class="right"><b>${escapeHtml(formatDecimal(item.cajonesEnviar))}</b></td>
        <td class="center">
          <div class="faltante-box" data-index="${index}"></div>
        </td>

        <td class="right">
  <input
    type="text"
    inputmode="decimal"
    class="cell-input cell-input-small input-kg"
    placeholder="0,0"
    name="kg_${index}"
    autocomplete="off"
  >
</td>
<td class="right">
  <input
    type="text"
    inputmode="numeric"
    class="cell-input cell-input-small input-caj"
    placeholder="0"
    name="caj_${index}"
    autocomplete="off"
  >
</td>
        
      </tr>
    `;
  });

  resultEl.innerHTML = filasFiltradas.length
    ? `
      <div class="articulo">
        <div class="articulo-header">${escapeHtml(nombre)}</div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th><span class="th-wrap">Sec</span></th>
                <th><span class="th-wrap">Descripción</span></th>
                <th class="right"><span class="th-wrap">Cjn<br>a Env.</span></th>
                <th class="center"><span class="th-wrap">Falt</span></th>
                <th class="right"><span class="th-wrap">Kg</span></th>
                <th class="right"><span class="th-wrap">Caj</span></th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `
    : `
      <div class="articulo">
        <div class="articulo-header">${escapeHtml(nombre)}</div>
        <div class="empty-state">No hay artículos con cajones a enviar mayores a 0.</div>
      </div>
    `;

  activarLogicaFaltante();
}

/*******************************************************
 * BOTON ENVIAR
 *******************************************************/
function obtenerClaveFila(row){
  const tallerista = row.dataset.tallerista || "";
  const sector = row.dataset.sector || "";
  const descripcion = row.dataset.descripcion || "";
  return `${tallerista}__${sector}__${descripcion}`;
}

function getDiaMesHoy(){
  const hoy = new Date();
  const dia = String(hoy.getDate()).padStart(2, "0");
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  return `${dia}/${mes}`;
}

function registrarCambioFila(row){
  const key = obtenerClaveFila(row);

  const tallerista = row.dataset.tallerista || "";
  const sector = row.dataset.sector || "";
  const descripcion = row.dataset.descripcion || "";

  const inputKg = row.querySelector('input[name^="kg_"]');
  const inputCaj = row.querySelector('input[name^="caj_"]');
  const faltanteBox = row.querySelector(".faltante-box");

  const kgEnviar = parseInputNumber(inputKg?.value);
  const cajEnviar = parseInputNumber(inputCaj?.value);
  const faltante = !!faltanteBox?.classList.contains("active"); // true o false

  const hayCambios =
    (kgEnviar !== null && kgEnviar !== 0) ||
    (cajEnviar !== null && cajEnviar !== 0) ||
    faltante === true;

  if (!hayCambios){
    filasModificadas.delete(key);
  } else {
    filasModificadas.set(key, {
      "Dia-mes": getDiaMesHoy(),
      "Tallerista": tallerista,
      "Sector": sector,
      "Descripcion": descripcion,
      "Faltante": faltante,
      "KG": kgEnviar ?? 0,
      "Cajones": cajEnviar ?? 0
    });
  }

  btnEnviarCambios.classList.toggle("hidden", filasModificadas.size === 0);
}

async function enviarCambios(volverLuego = false){
  if (!filasModificadas.size) return true;

  btnEnviarCambios.disabled = true;
  btnEnviarCambios.textContent = "Enviando...";

  const payload = Array.from(filasModificadas.values());
  console.log("Payload a insertar:", payload);

  const { data, error } = await supabaseClient
    .from(TABLA_DESTINO)
    .insert(payload)
    .select();

  if (error){
    console.error("Error al guardar cambios:", error);
    alert(
      "No se pudieron guardar los cambios.\n\n" +
      "Mensaje: " + (error.message || "") + "\n" +
      "Detalle: " + (error.details || "") + "\n" +
      "Hint: " + (error.hint || "")
    );
    btnEnviarCambios.disabled = false;
    btnEnviarCambios.textContent = "Enviar";
    return false;
  }

  console.log("Insert ok:", data);
  alert("Cambios enviados correctamente.");

  filasModificadas.clear();
  btnEnviarCambios.classList.add("hidden");
  btnEnviarCambios.disabled = false;
  btnEnviarCambios.textContent = "Enviar";

  if (volverLuego){
    talleristaActivo = "";
    resultEl.innerHTML = "";
    btnVolver.classList.add("hidden");
    renderTalleristas(listaTalleristas);
  } else if (talleristaActivo){
    buscar(talleristaActivo);
  }

  return true;
}

btnEnviarCambios.addEventListener("click", enviarCambios);

/*************************************************
 * INICIO
 *************************************************/
cargarTalleristas();
