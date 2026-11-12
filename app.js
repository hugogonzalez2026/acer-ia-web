"use strict";
const $ = (id) => document.getElementById(id);
const state = {finance: [], creative: [], server: "", username: "", password: ""};
function apiHeaders(){return {Authorization:"Basic "+btoa(String.fromCharCode(...new TextEncoder().encode(state.username+":"+state.password)))};}
function sanitizeServer(input){
  const url=new URL(input);
  if(url.protocol!=="https:"||url.port||url.username||url.password||url.pathname!=="/"||url.search||url.hash||
      !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+\.ts\.net$/i.test(url.hostname)){
    throw new Error("Ingresá una URL HTTPS válida de tu Acer terminada en .ts.net, sin rutas ni parámetros.");
  }
  return url.origin;
}
async function login(event){
  event.preventDefault();
  const button=$("login-button"); button.disabled=true; $("login-error").hidden=true;
  try{
    const server=sanitizeServer($("server-url").value.trim());
    const username=$("login-user").value.trim();
    const password=$("login-pass").value;
    if(!username||!password)throw new Error("Completá usuario y contraseña");
    state.server=server;state.username=username;state.password=password;
    const response=await fetch(server+"/api/markets",{headers:apiHeaders(),cache:"no-store"});
    if(response.status===401||response.status===429)throw new Error("Acceso rechazado o demasiados intentos. Revisá las credenciales.");
    if(!response.ok)throw new Error("La Acer no respondió correctamente ("+response.status+").");
    localStorage.setItem("acerIAserver",server);
    $("login-pass").value="";
    $("connection").hidden=true;$("workspace").hidden=false;
    await refreshPrices();
  }catch(err){
    state.server="";state.username="";state.password="";
    $("login-error").textContent=err.message||"No se pudo conectar. Revisá la URL, Tailscale y la Acer.";
    $("login-error").hidden=false;
  }finally{button.disabled=false;}
}
$("login-form").addEventListener("submit",login);
$("logout").addEventListener("click",()=>{
  if(running&&controller)controller.abort();
  state.server="";state.username="";state.password="";state.finance=[];state.creative=[];
  $("workspace").hidden=true;$("connection").hidden=false;$("login-pass").value="";
  $("login-error").hidden=true;renderMessages();
});
$("server-url").value=localStorage.getItem("acerIAserver")||"";

let mode = "finance", running = false, controller = null;
const elements = {messages:$("messages"), input:$("prompt"), send:$("send")};
function renderMessages(){
  elements.messages.replaceChildren();
  if (!state[mode].length){
    const empty=document.createElement("div"); empty.className="empty-state";
    const symbol=document.createElement("div"); symbol.className="empty-symbol"; symbol.textContent=mode==="finance"?"✳":"✦";
    const heading=document.createElement("h2"); heading.textContent=mode==="finance"?"¿Qué analizamos hoy?":"¿Qué creamos hoy?";
    const intro=document.createElement("p"); intro.textContent=mode==="finance"?"Podés consultar sobre mercados, estrategias y decisiones de inversión.":"Ideas, textos, proyectos, programación y creatividad.";
    empty.append(symbol,heading,intro); elements.messages.append(empty); return;
  }
  for(const message of state[mode]){
    const node=document.createElement("div"); node.className="message "+message.role+(message.pending?" pending":"");
    node.textContent=message.content || "Pensando…";
    elements.messages.append(node);
  }
  elements.messages.scrollTop=elements.messages.scrollHeight;
}
function selectMode(next){
  if(running || !["finance","creative"].includes(next)) return;
  mode=next;
  for (const item of document.querySelectorAll(".tab")){
    const active=item.dataset.mode===mode; item.classList.toggle("active",active); item.setAttribute("aria-pressed",String(active));
  }
  $("finance-market").hidden=mode!=="finance";
  $("chat-title").textContent=mode==="finance"?"Analista financiero":"IA generativa";
  $("chat-subtitle").textContent=mode==="finance"?"Investigación, escenarios y riesgos. Nunca opera con dinero.":"Textos, ideas, código y creación libre en tu equipo.";
  $("prompt").placeholder=mode==="finance"?"Ej.: ¿Qué riesgos tiene comprar BTC hoy?":"Ej.: Escribí un cuento de ciencia ficción…";
  $("error").hidden=true; renderMessages();
}
async function refreshPrices(){
  $("price-time").textContent="Actualizando…";
  try {
    const resp=await fetch(state.server+"/api/markets",{cache:"no-store",headers:apiHeaders()});
    if(!resp.ok) throw new Error("Sin datos");
    const data=await resp.json();
    if(data.error) throw new Error(data.error);
    const price=(x)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(x);
    $("btc-price").textContent=price(data.quotes["BTC/USD"]);
    $("eth-price").textContent=price(data.quotes["ETH/USD"]);
    $("price-time").textContent="Consulta: "+new Date(data.retrieved_at_utc).toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"});
  } catch(error){
    $("price-time").textContent="Cotizaciones no disponibles";
    $("btc-price").textContent="—"; $("eth-price").textContent="—";
  }
}
async function send(event){
  event.preventDefault(); if(running) return;
  const prompt=elements.input.value.trim(); if(!prompt) return;
  running=true; elements.send.disabled=true; $("error").hidden=true;
  elements.input.value="";
  const history=state[mode];
  history.push({role:"user",content:prompt});
  const selectedMode=mode;
  const toSend=history.slice(-9).map(({role,content})=>({role,content}));
  const answer={role:"assistant",content:"",pending:true}; history.push(answer); renderMessages();
  controller=new AbortController();
  try{
    const response=await fetch(state.server+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json",...apiHeaders()},body:JSON.stringify({mode:selectedMode,messages:toSend}),signal:controller.signal});
    if(!response.ok){const info=await response.json().catch(()=>({})); throw new Error(info.error||"No se pudo consultar la IA");}
    const reader=response.body.getReader(), decoder=new TextDecoder(); let buffer="";
    while(true){
      const part=await reader.read(); if(part.done) break;
      buffer+=decoder.decode(part.value,{stream:true});
      const lines=buffer.split("\n"); buffer=lines.pop();
      for(const line of lines){
        if(!line.trim()) continue;
        const packet=JSON.parse(line);
        if(packet.error) throw new Error(packet.error);
        answer.content+=packet.delta||""; answer.pending=false; renderMessages();
      }
    }
    if(!answer.content) answer.content="El modelo no devolvió texto. Probá otra consulta.";
  }catch(err){
    answer.content=answer.content||"No pude responder esta vez.";
    $("error").textContent="Error: "+(err.name==="AbortError"?"Consulta cancelada":err.message);
    $("error").hidden=false;
  }finally{answer.pending=false; running=false; elements.send.disabled=false; controller=null; renderMessages(); elements.input.focus();}
}
for(const tab of document.querySelectorAll(".tab")){tab.addEventListener("click",()=>selectMode(tab.dataset.mode));}
$("clear-chat").addEventListener("click",()=>{if(!running){state[mode]=[]; renderMessages(); $("error").hidden=true;}});
$("refresh-prices").addEventListener("click",refreshPrices);
$("prompt-form").addEventListener("submit",send);
elements.input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();$("prompt-form").requestSubmit();}});
selectMode("finance");