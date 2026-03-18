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

let talleristaActivo = "";
let listaTalleristas = [];

/*************************************************
 * HELPERS
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

  const num = Number(raw.replace(",", "."));
  if (Number.isFinite(num)){
    return String(Math.trunc(num)).padStart(3, "0");
  }

  return raw.replace(/\D/g, "").padStart(3, "0");
}

function splitCodes(value){
  return String(value || "")
    .split(",")
    .map(x => normalizeCode(x))
    .filter(Boolean);
}

function parseDecimal(value){
  if (!value) return 0;
  return Number(String(value).replace(",", ".")) || 0;
}
/*************************************************
 * CACHES
 *************************************************/
let consumosCache = null;
let sectoresCache = null;
let stockTalleristaCache = null;
let entregasCache = null;
let enviosCache = null;

/*************************************************
 * HELPERS EXTRA
 *************************************************/
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

function formatDecimal(n){
  return Number(n || 0).toLocaleString("es-AR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function elegirConsumo(ch, lk){
  const a = Number(ch || 0);
  const b = Number(lk || 0);

  if (a > 0 && b === 0) return a;
  if (b > 0 && a === 0) return b;
  if (a > 0 && b > 0) return Math.max(a, b);
  return 0;
}

function parseFechaDDMM(value){
  const s = String(value || "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;

  const dd = Number(m[1]);
  const mm = Number(m[2]);

  if (!dd || !mm) return null;

  return { dd, mm };
}

function sortKeyFechaDDMM(value){
  const p = parseFechaDDMM(value);
  if (!p) return 9999;
  return (p.mm * 100) + p.dd;
}

/*************************************************
 * CARGAS
 *************************************************/
async function cargarConsumos(){
  if (consumosCache) return consumosCache;

  const [respCH, respLK] = await Promise.all([
    supabaseClient.from("E. Madre CH").select("*").limit(10000),
    supabaseClient.from("E. Madre LK").select("*").limit(10000)
  ]);

  if (respCH.error) throw new Error("Error al leer E. Madre CH");
  if (respLK.error) throw new Error("Error al leer E. Madre LK");

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

async function cargarSectores(){
  if (sectoresCache) return sectoresCache;

  const { data, error } = await supabaseClient
    .from("Despiece x Articulo")
    .select("*")
    .limit(20000);

  if (error) throw new Error("Error al leer Despiece x Articulo");

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

async function cargarStockTallerista(){
  if (stockTalleristaCache) return stockTalleristaCache;

  const { data, error } = await supabaseClient
    .from("Articulos Virgilio X Tallerista")
    .select("*")
    .limit(20000);

  if (error) throw new Error("Error al leer Articulos Virgilio X Tallerista");

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

async function cargarEntregas(){
  if (entregasCache) return entregasCache;

  const [respEntregas, respPartes] = await Promise.all([
    supabaseClient.from("Entregas Tallerista Virgilio").select("*").limit(20000),
    supabaseClient.from("Partes x Tallerista").select("*").limit(20000)
  ]);

  if (respEntregas.error) throw new Error("Error al leer Entregas Tallerista Virgilio");
  if (respPartes.error) throw new Error("Error al leer Partes x Tallerista");

  const uniXCajaByNombreTallAndCod = new Map();

  (respPartes.data || []).forEach(r => {
    const nombreTall = normalizeText(
      pick(r, ["tallerista", "Tallerista", "TALLERISTA"])
    );

    const uniXCaja = parseDecimal(
      pick(r, ["uni_x_cja", "Uni_x_cja", "UNI_X_CJA", "uni x cja"])
    );

    const codigosParte = [
      normalizeCode(pick(r, ["cod_art", "Cod_Art", "COD_ART"]))
    ].filter(Boolean);

    if (!nombreTall || !codigosParte.length) return;

    codigosParte.forEach(cod => {
      const key = `${nombreTall}__${cod}`;
      const actual = Number(uniXCajaByNombreTallAndCod.get(key) || 0);
      uniXCajaByNombreTallAndCod.set(key, Math.max(actual, Number(uniXCaja || 0)));
    });
  });

  const detalleByNombreTallAndCod = new Map();
  const totalByNombreTallAndCod = new Map();

  (respEntregas.data || []).forEach(r => {
    const nombreTall = normalizeText(
      pick(r, ["Nombre_Tall", "nombre_tall", "NOMBRE_TALL"])
    );

    const cod = normalizeCode(
      pick(r, ["Cod", "cod", "COD"])
    );

    const cajas = parseDecimal(
      pick(r, ["Cajas", "cajas", "CAJAS"])
    );

    const fecha = String(
      pick(r, ["Fecha", "fecha", "FECHA"]) || ""
    ).trim();

    if (!nombreTall || !cod || !cajas) return;

    const uniXCaja = Number(uniXCajaByNombreTallAndCod.get(`${nombreTall}__${cod}`) || 0);
    const unidades = cajas * uniXCaja;
    const key = `${nombreTall}__${cod}`;

    if (!detalleByNombreTallAndCod.has(key)) detalleByNombreTallAndCod.set(key, []);
    detalleByNombreTallAndCod.get(key).push({
      fecha,
      unidades,
      cajas,
      uniXCaja,
      cod
    });

    totalByNombreTallAndCod.set(key, (totalByNombreTallAndCod.get(key) || 0) + unidades);
  });

  for (const [key, arr] of detalleByNombreTallAndCod.entries()){
    arr.sort((a, b) => sortKeyFechaDDMM(a.fecha) - sortKeyFechaDDMM(b.fecha));
    detalleByNombreTallAndCod.set(key, arr);
  }

  entregasCache = {
    totalByNombreTallAndCod,
    detalleByNombreTallAndCod
  };

  return entregasCache;
}

async function cargarEnvios(){
  if (enviosCache) return enviosCache;

  const { data, error } = await supabaseClient
    .from("Envios a Talleristas")
    .select("*")
    .limit(20000);

  if (error) throw new Error("Error al leer Envios a Talleristas");

  const detalleMap = new Map();
  const totalKgMap = new Map();

  (data || []).forEach(r => {
    const tallerista = normalizeText(pick(r, ["Tallerista", "tallerista", "TALLERISTA"]));
    const sector = normalizeText(pick(r, ["Sector", "sector", "SECTOR"]));
    const descripcion = normalizeText(pick(r, ["Descripcion", "descripcion", "DESCRIPCION", "Descripción"]));

    const fecha = String(
      pick(r, ["Dia-mes", "dia-mes", "DIA-MES", "Dia_mes"]) || ""
    ).trim();

    const kg = parseDecimal(pick(r, ["KG", "kg", "Kg"]));
    const cajones = parseDecimal(pick(r, ["Cajones", "cajones", "CAJONES", "Caj", "caj"]));

    if (!tallerista || !descripcion) return;
    if (!kg && !cajones) return;

    const key = `${tallerista}__${sector}__${descripcion}`;

    if (!detalleMap.has(key)) detalleMap.set(key, []);
    detalleMap.get(key).push({ fecha, kg, cajones });

    totalKgMap.set(key, (totalKgMap.get(key) || 0) + kg);
  });

  for (const [key, arr] of detalleMap.entries()){
    arr.sort((a, b) => sortKeyFechaDDMM(a.fecha) - sortKeyFechaDDMM(b.fecha));
    detalleMap.set(key, arr);
  }

  enviosCache = {
    detalleMap,
    totalKgMap
  };

  return enviosCache;
}

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

function calcularCajones(consumoTotal, kgXUni, partesXUni, kgXCajon){
  const consumo = Number(consumoTotal || 0);
  const uni = Number(kgXUni || 0);
  const partes = Number(partesXUni || 0);
  const caj = Number(kgXCajon || 0);

  if (caj <= 0 || consumo <= 0 || uni <= 0 || partes <= 0) return 0;

  return (consumo * uni * partes) / caj;
}

function obtenerEntregasTallerista(nombreTallerista, codigos, entregasData){
  const nombreTallNorm = normalizeText(nombreTallerista);

  let totalUnidades = 0;

  if (!nombreTallNorm){
    return { totalUnidades: 0, detalle: [] };
  }

  for (const cod of codigos){
    const key = `${nombreTallNorm}__${cod}`;
    totalUnidades += Number(entregasData.totalByNombreTallAndCod.get(key) || 0);
  }

  return {
    totalUnidades
  };
}

function obtenerEnviosTallerista(nombre, sector, descripcion, enviosData, kgXUni){
  const key = `${normalizeText(nombre)}__${normalizeText(sector)}__${normalizeText(descripcion)}`;

  const totalKg = Number(enviosData.totalKgMap.get(key) || 0);
  const totalUni = kgXUni > 0 ? Math.round(totalKg / kgXUni) : 0;

  return {
    totalKg,
    totalUni
  };
}

/*************************************************
 * VISUAL
 *************************************************/
function escapeHtml(s){
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/*************************************************
 * RENDER TALLERISTAS
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

  if (btnVolver) btnVolver.classList.remove("hidden");

  buscar(nombre);
}

function volverALista(){
  talleristaActivo = "";
  resultEl.innerHTML = "";

  if (btnVolver) btnVolver.classList.add("hidden");
  renderTalleristas(listaTalleristas);
}

if (btnVolver){
  btnVolver.addEventListener("click", volverALista);
}

/*************************************************
 * CARGA INICIAL
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
 * ENVÍO DE CAMBIOS
 *************************************************/
function activarBotonEnviar(){
  if (!btnEnviarCambios) return;

  resultEl.querySelectorAll("tbody tr").forEach(row => {
    const inputs = row.querySelectorAll("input");

    inputs.forEach(input => {
      input.addEventListener("input", () => {
        btnEnviarCambios.classList.remove("hidden");
      });
    });
  });
}

async function enviarCambios(){
  if (!btnEnviarCambios) return;

  const filas = [...resultEl.querySelectorAll("tbody tr")];
  const registros = [];

  filas.forEach(row => {
    const tallerista = row.dataset.tallerista || "";
    const sector = row.dataset.sector || "";
    const descripcion = row.dataset.descripcion || "";

    const inputKg = row.querySelector(".input-kg");
    const inputCaj = row.querySelector(".input-caj");
    const box = row.querySelector(".faltante-box");

    const kg = parseDecimal(inputKg?.value);
    const cajones = parseDecimal(inputCaj?.value);
    const faltante = box?.classList.contains("active") ? "F" : "";

    if (!kg && !cajones && !faltante) return;

    const hoy = new Date();
    const dia = String(hoy.getDate()).padStart(2, "0");
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const diaMes = `${dia}/${mes}`;

    registros.push({
      "Dia-mes": diaMes,
      "Tallerista": tallerista,
      "Sector": sector,
      "Descripcion": descripcion,
      "KG": kg || 0,
      "Cajones": cajones || 0,
      "Faltante": faltante
    });
  });

  if (!registros.length){
    alert("No hay cambios para enviar");
    return;
  }

  btnEnviarCambios.disabled = true;
  btnEnviarCambios.textContent = "Enviando...";
  
console.log("Registros a insertar:", registros);

const { error } = await supabaseClient
  .from("Envios a Talleristas")
  .insert(registros);

if (error){
  console.error("Error al enviar:", error);

  alert(
    "Error al guardar en Supabase:\n" +
    (error.message || "") +
    (error.details ? "\nDetalles: " + error.details : "") +
    (error.hint ? "\nHint: " + error.hint : "")
  );

  btnEnviarCambios.disabled = false;
  btnEnviarCambios.textContent = "Enviar";
  return;
}

  alert("Enviado correctamente");
  btnEnviarCambios.disabled = false;
  btnEnviarCambios.textContent = "Enviar";
  btnEnviarCambios.classList.add("hidden");

  if (talleristaActivo){
    await buscar(talleristaActivo);
  }
}

if (btnEnviarCambios){
  btnEnviarCambios.addEventListener("click", enviarCambios);
}

/*************************************************
 * BÚSQUEDA PRINCIPAL
 *************************************************/
async function buscar(nombreParam){
  const nombre = String(nombreParam || "").trim();
  if (!nombre) return;

  if (btnEnviarCambios){
    btnEnviarCambios.classList.add("hidden");
    btnEnviarCambios.disabled = false;
    btnEnviarCambios.textContent = "Enviar";
  }

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
        <div class="empty-state">No hay datos para este tallerista.</div>
      </div>
    `;
    return;
  }

  let consumoMap, sectoresData, stockMap, entregasData, enviosData;

  try{
    [consumoMap, sectoresData, stockMap, entregasData, enviosData] = await Promise.all([
      cargarConsumos(),
      cargarSectores(),
      cargarStockTallerista(),
      cargarEntregas(),
      cargarEnvios()
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

    const stockInicialKg = parseDecimal(
      pick(r, [
        "Stock Inicial",
        "stock_inicial",
        "stock inicial",
        "Stock_Inicial"
      ])
    );

    const enviosInfo = obtenerEnviosTallerista(nombre, sectorProce, descripcion, enviosData, kgXUni);
    const totalEnviosUni = enviosInfo.totalUni;

    const entregasInfo = obtenerEntregasTallerista(nombre, codigos, entregasData);
    const totalEntregasUni = entregasInfo.totalUnidades;

    const onlineUni = kgXUni > 0
      ? (stockInicialKg / kgXUni) + totalEnviosUni - totalEntregasUni
      : 0;

    const onlineKg = onlineUni * kgXUni;

    const onlineCaj = kgXCajon > 0
      ? (onlineKg / kgXCajon)
      : 0;

    const cajonesEnviar = Math.max(0, maxCajones - onlineCaj);

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

  resultEl.innerHTML = `
    <div class="articulo">
      <div class="articulo-header">${escapeHtml(nombre)}</div>

      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th><span class="th-wrap">SEC</span></th>
              <th><span class="th-wrap">Descripción</span></th>
              <th><span class="th-wrap">Cjn<br>a Env</span></th>
              <th><span class="th-wrap">F</span></th>
              <th><span class="th-wrap">Kg</span></th>
              <th><span class="th-wrap">Caj</span></th>
            </tr>
          </thead>
          <tbody>
            ${rows || `
              <tr>
                <td colspan="6" class="center zero">No hay artículos con cajones a enviar mayores a 0.</td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    </div>
  `;

  resultEl.querySelectorAll(".faltante-box").forEach(box => {
    box.addEventListener("click", () => {
      box.classList.toggle("active");
      box.textContent = box.classList.contains("active") ? "F" : "";

      if (btnEnviarCambios){
        btnEnviarCambios.classList.remove("hidden");
      }
    });
  });

  activarBotonEnviar();
}

/*************************************************
 * INICIO
 *************************************************/
document.addEventListener("DOMContentLoaded", () => {
  cargarTalleristas();
});

