const SUPABASE_URL = "https://hrxfctzncixxqmpfhskv.supabase.co";
const SUPABASE_KEY = "sb_publishable_BqpAgZH6ty-9wft10_YMhw_0rcIPuWT";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/*************************************************
 * TABLAS
 *************************************************/
const TABLA_PARTES = "Partes x PS";
const TABLA_SP_KG = "SP Kg";

/*************************************************
 * DOM
 *************************************************/
const grid = document.getElementById("talleristasGrid");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const btnVolver = document.getElementById("btnVolver");

/*************************************************
 * STATE
 *************************************************/
let partesCache = null;
let spKgCache = null;
let listaPS = [];
let psActivo = "";

/*************************************************
 * HELPERS
 *************************************************/
function setStatus(t){ statusEl.textContent = t || ""; }

function escapeHtml(s){
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;");
}

function pick(o,k){
  for(const key of k){
    if(o && key in o) return o[key];
  }
  return "";
}

function num(n){ return Number(n||0); }

/*************************************************
 * CARGA LISTA PS
 *************************************************/
async function cargarPS(){
  const { data } = await supabaseClient.from(TABLA_PARTES).select("PS");

  listaPS = [...new Set(data.map(x => x.PS).filter(Boolean))].sort();

  grid.innerHTML = "";
  listaPS.forEach(ps=>{
    const b = document.createElement("button");
    b.className = "tallerista-btn";
    b.textContent = ps;
    b.onclick = ()=>seleccionar(ps);
    grid.appendChild(b);
  });

  setStatus("Seleccioná un proveedor");
}

/*************************************************
 * CACHE
 *************************************************/
async function cargarPartes(){
  if(partesCache) return partesCache;

  const { data } = await supabaseClient.from(TABLA_PARTES).select("*");

  partesCache = data;
  return data;
}

async function cargarSPKG(){
  if(spKgCache) return spKgCache;

  const { data } = await supabaseClient.from(TABLA_SP_KG).select("*");

  const map = new Map();

  data.forEach(r=>{
    const key = String(r.Sp || "").trim().toLowerCase();
    if (!key) return;
  
    map.set(key,{
      kgUni: num(r["Kg x UNI"]),
      kgCaj: num(r["Kg Cajon"])
    });
  });

  spKgCache = map;
  return map;
}

/*************************************************
 * SELECCION
 *************************************************/
async function seleccionar(ps){
  psActivo = ps;
  btnVolver.classList.remove("hidden");

  const partes = await cargarPartes();
  const spKg = await cargarSPKG();

  const filas = partes.filter(x => x.PS === ps);

  let rows = "";

  filas.forEach(item=>{
    const key = String(item.SP || "").trim().toLowerCase();
    const info = spKg.get(key) || { kgUni: 0, kgCaj: 0 };

    const onlineKg = 0;
    const onlineCaj = 0;
    const onlineUni = 0;
    const enviar = 0;

    rows += `
    <tr>
      <td>${escapeHtml(item.SC)}</td>
      <td>${escapeHtml(item.SP)}</td>
      <td>${escapeHtml(item.Parte)}</td>

      <td>${onlineKg}</td>
      <td>${onlineCaj}</td>
      <td>${onlineUni}</td>

      <td>${enviar}</td>

      <td>0</td>
      <td>0</td>

      <td>${info.kgUni}</td>
      <td>${info.kgCaj}</td>
    </tr>`;
  });

  resultEl.innerHTML = `
  <div class="articulo">
    <div class="articulo-header">${ps}</div>

    <table class="table">
      <thead>
        <tr>
          <th colspan="3">Base</th>
          <th colspan="3">Online</th>
          <th>Enviar</th>
          <th colspan="2">Movimientos</th>
          <th colspan="2">Info</th>
        </tr>
        <tr>
          <th>SC</th>
          <th>SP</th>
          <th>Descripción</th>

          <th>Kg</th>
          <th>Caj</th>
          <th>Uni</th>

          <th>Cjn</th>

          <th>Env</th>
          <th>Ent</th>

          <th>Kg x Uni</th>
          <th>Kg x Caj</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/*************************************************
 * VOLVER
 *************************************************/
btnVolver.onclick = ()=>{
  psActivo = "";
  resultEl.innerHTML = "";
  btnVolver.classList.add("hidden");
};

/*************************************************
 * INIT
 *************************************************/
document.addEventListener("DOMContentLoaded", cargarPS);
