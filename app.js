"use strict";
const $ = (id) => document.getElementById(id);
const state = {finance: [], creative: [], code: [], server: "", username: "", password: ""};
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
    await refreshImageAvailability();
    await loadImageGallery();
  }catch(err){
    state.server="";state.username="";state.password="";
    $("login-error").textContent=err.message||"No se pudo conectar. Revisá la URL, Tailscale y la Acer.";
    $("login-error").hidden=false;
  }finally{button.disabled=false;}
}
$("login-form").addEventListener("submit",login);
$("logout").addEventListener("click",()=>{
  if(running&&controller)controller.abort();
  state.server="";state.username="";state.password="";state.finance=[];state.creative=[];state.code=[];
  $("workspace").hidden=true;$("connection").hidden=false;$("login-pass").value="";
  $("login-error").hidden=true;renderMessages();resetImageView();clearImageGallery();
});
$("server-url").value=localStorage.getItem("acerIAserver")||"";

let mode = "finance", running = false, controller = null;
const elements = {messages:$("messages"), input:$("prompt"), send:$("send")};
function renderMessages(){
  elements.messages.replaceChildren();
  if (!state[mode].length){
    const empty=document.createElement("div"); empty.className="empty-state";
    const symbol=document.createElement("div"); symbol.className="empty-symbol"; symbol.textContent=mode==="finance"?"✳":mode==="code"?"⌘":"✦";
    const heading=document.createElement("h2"); heading.textContent=mode==="finance"?"¿Qué analizamos hoy?":mode==="code"?"¿Qué programamos hoy?":"¿Qué creamos hoy?";
    const intro=document.createElement("p"); intro.textContent=mode==="finance"?"Podés consultar sobre mercados, estrategias y decisiones de inversión.":mode==="code"?"Describí lo que necesitás y la IA te ayudará a escribir el código.":"Ideas, textos, proyectos, programación y creatividad.";
    empty.append(symbol,heading,intro); elements.messages.append(empty); return;
  }
  for(const message of state[mode]){
    const node=document.createElement("div"); node.className="message "+message.role+(message.pending?" pending":"");
    node.textContent=message.content || "Pensando…";
    elements.messages.append(node);
  }
  elements.messages.scrollTop=elements.messages.scrollHeight;
}
function generatedCode(){
  const answers=state.code.filter(message=>message.role==="assistant"&&!message.pending&&message.content);
  if(!answers.length) return "";
  const content=answers[answers.length-1].content;
  const fences=Array.from(content.matchAll(/```[^\r\n]*\r?\n([\s\S]*?)```/g));
  if(fences.length){
    fences.sort((a,b)=>b[1].length-a[1].length);
    return fences[0][1].trim();
  }
  return content.trim();
}
function updateCodeOutput(){
  const source=generatedCode();
  $("code-output").textContent=source||"Pedile abajo un programa y lo vas a ver acá.";
  $("copy-code").disabled=!source;
  $("download-code").disabled=!source;
  $("code-status").textContent=source?source.length.toLocaleString("es-AR")+" caracteres":"Todavía no hay código";
}
function selectMode(next){
  if(running||!["finance","creative","code","images"].includes(next))return;
  mode=next;
  for(const item of document.querySelectorAll(".tab")){
    const active=item.dataset.mode===mode;
    item.classList.toggle("active",active);
    item.setAttribute("aria-pressed",String(active));
  }
  $("finance-market").hidden=mode!=="finance";
  $("code-panel").hidden=mode!=="code";
  $("images-panel").hidden=mode!=="images";
  if(mode==="images"&&state.server)refreshImageAvailability();
  if(mode==="images"&&state.server)loadImageGallery();
  $("conversation").hidden=mode==="images";
  const config={
    finance:{title:"Analista financiero",subtitle:"Investigación, escenarios y riesgos. Nunca opera con dinero.",placeholder:"Ej.: ¿Qué riesgos tiene comprar BTC hoy?"},
    creative:{title:"IA generativa",subtitle:"Textos, ideas y creación libre en tu equipo.",placeholder:"Ej.: Escribí un cuento de ciencia ficción…"},
    code:{title:"Asistente de programación",subtitle:"Generá código, revisalo y descargalo. Sin ejecución automática.",placeholder:"Ej.: Creá un programa que analice un CSV de operaciones…"},
    images:{title:"Estudio de imágenes",subtitle:"Creación visual local.",placeholder:"Describí la imagen que querés crear…"}
  }[mode];
  $("chat-title").textContent=config.title;
  $("chat-subtitle").textContent=config.subtitle;
  $("prompt").placeholder=config.placeholder;
  $("prompt").maxLength=mode==="code"?3500:4000;
  $("error").hidden=true;
  renderMessages();
  updateCodeOutput();
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
  const selectedLanguage=$("code-language").value;
  const toSend=history.slice(-9).map(({role,content},index,array)=>{
    if(selectedMode==="code"&&role==="user"&&index===array.length-1){
      return {role,content:"Actuá como asistente de programación. Lenguaje: "+selectedLanguage+
        ". Escribí código funcional, completo y legible, con un solo bloque de código entre tres acentos graves, seguido de una explicación breve y pruebas recomendadas. No afirmes haberlo ejecutado. Pedido: "+content};
    }
    return {role,content};
  });
  const answer={role:"assistant",content:"",pending:true}; history.push(answer); renderMessages();
  controller=new AbortController();
  try{
    const response=await fetch(state.server+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json",...apiHeaders()},body:JSON.stringify({mode:selectedMode==="code"?"creative":selectedMode,messages:toSend}),signal:controller.signal});
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
  }finally{answer.pending=false; running=false; elements.send.disabled=false; controller=null; renderMessages(); updateCodeOutput(); elements.input.focus();}
}
for(const tab of document.querySelectorAll(".tab")){tab.addEventListener("click",()=>selectMode(tab.dataset.mode));}
$("clear-chat").addEventListener("click",()=>{if(!running){state[mode]=[]; renderMessages(); $("error").hidden=true;}});
$("refresh-prices").addEventListener("click",refreshPrices);
$("prompt-form").addEventListener("submit",send);
elements.input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();$("prompt-form").requestSubmit();}});
const filenameByLanguage={python:"script.py",javascript:"app.js",html:"pagina.html",css:"estilos.css",bash:"script.sh",sql:"consulta.sql",text:"archivo.txt"};

let imageBusy=false, imagePreviewUrl=null, imageOutputBlob=null;
let imageLastSeed=null, imageLastParams=null;
let imageProgressTimer=null, imageProgressStart=0;
function imageElapsed(seconds){
  const total=Math.max(0,Math.floor(seconds));
  return Math.floor(total/60)+":"+String(total%60).padStart(2,"0");
}
function imageProgressStage(label,explanation){
  $("image-progress-stage").textContent=label;
  $("image-progress-info").textContent=explanation;
}
function imageProgressBegin(){
  imageProgressStart=Date.now();
  $("image-progress").hidden=false;
  $("images-stage").textContent="Generando…";
  $("image-progress-clock").textContent="0:00";
  if(imageProgressTimer)clearInterval(imageProgressTimer);
  imageProgressTimer=setInterval(()=>{
    $("image-progress-clock").textContent=imageElapsed((Date.now()-imageProgressStart)/1000);
  },1000);
  imageProgressStage("Preparando solicitud…","Conectando con el motor de imágenes.");
}
function imageProgressEnd(){
  if(imageProgressTimer){clearInterval(imageProgressTimer);imageProgressTimer=null;}
  $("image-progress").hidden=true;
}

function resetImageView(){
  imageProgressEnd();
  $("image-generate").disabled=true;
  $("images-stage").textContent="Sin conexión";
  $("image-download").hidden=true;
  $("image-preview").hidden=true;
  $("image-result-status").textContent="Sin imagen disponible en la web todavía";
  if(imagePreviewUrl){URL.revokeObjectURL(imagePreviewUrl);imagePreviewUrl=null;}
  imageOutputBlob=null;
}
async function refreshImageAvailability(){
  if(!state.server||imageBusy)return;
  const label=$("images-stage");
  label.textContent="Comprobando motor…";
  $("image-generate").disabled=true;
  try{
    const resp=await fetch(state.server+"/api/images/status",{headers:apiHeaders(),cache:"no-store"});
    if(resp.status===404){
      label.textContent="Conexión pendiente";
      $("image-notice").textContent="ComfyUI ya funciona en la Acer, pero el servidor web todavía necesita actualizar el puente de imágenes. No se puede generar desde esta pestaña hasta completar esa instalación.";
      return;
    }
    if(!resp.ok)throw new Error("Servidor HTTP "+resp.status);
    const info=await resp.json();
    if(info.available){
      label.textContent="Motor disponible";
      $("image-generate").disabled=false;
      $("image-notice").textContent="Generación local por CPU. Una imagen a la vez, con tiempos variables según resolución y pasos.";
    }else{
      label.textContent="Motor no disponible";
      $("image-notice").textContent="El servidor web respondió, pero todavía no pudo conectarse con ComfyUI. Revisá el estado del motor.";
    }
  }catch(err){
    label.textContent="Sin conexión";
    $("image-notice").textContent="No se pudo comprobar el generador: "+(err.message||"Revisá tu Acer.");
  }
}
async function generateImage(){
  if(imageBusy||!state.server)return;
  const description=$("image-prompt").value.trim();
  if(!description){$("image-result-status").textContent="Primero describí tu imagen.";return;}
  imageBusy=true;
  $("image-repeat").disabled=true;
  $("image-variation").disabled=true;
  imageProgressBegin();
  $("image-generate").disabled=true;
  $("image-download").hidden=true;
  $("image-result-status").textContent="Enviando solicitud a la Acer…";
  if(imagePreviewUrl){URL.revokeObjectURL(imagePreviewUrl);imagePreviewUrl=null;}
  $("image-preview").hidden=true;imageOutputBlob=null;
  try{
    const resp=await fetch(state.server+"/api/images/jobs",{
      method:"POST",headers:{"Content-Type":"application/json",...apiHeaders()},
      body:JSON.stringify({
        prompt:description,
        size:Number($("image-size").value),
        steps:Number($("image-steps").value),
        preset:$("image-preset").value,
        interpretation:$("image-interpretation").value,
        sampler:$("image-sampler").value,
        cfg:Number($("image-cfg").value),
        seed:$("image-seed").value===""?null:Number($("image-seed").value)
      })
    });
    const job=await resp.json().catch(()=>({}));
    if(!resp.ok)throw new Error(job.error||"El motor rechazó el trabajo ("+resp.status+")");
    if(typeof job.job_id!=="string")throw new Error("No recibí un identificador del trabajo");
    if(Number.isInteger(job.seed)){
      imageLastSeed=job.seed;
      imageLastParams={
        prompt:description,seed:job.seed,preset:$("image-preset").value,interpretation:$("image-interpretation").value,
        sampler:job.sampler||$("image-sampler").value,
        cfg:job.cfg??Number($("image-cfg").value),
        steps:job.steps??Number($("image-steps").value),
        size:Number($("image-size").value)
      };
      $("image-last-settings").textContent="Modelo: "+(job.model||"SD 1.5")+" · Semilla utilizada: "+job.seed+" · "+(job.sampler||"sampler")+" · CFG "+(job.cfg??"")+" · "+(job.steps??"")+" pasos";
      // No copiar la seed aleatoria en el campo: si sigue vacío, la próxima
      // pulsación de Generar produce una imagen nueva.
    }
    $("image-result-status").textContent="Generando en la Acer…";
    imageProgressStage("Solicitud aceptada","Esperando confirmación de la cola de ComfyUI.");
    let completed=false;
    for(let count=0;count<180;count++){
      await new Promise(resolve=>setTimeout(resolve,10000));
      if(!state.server)throw new Error("Se cerró la conexión");
      const progress=await fetch(state.server+"/api/images/jobs/"+encodeURIComponent(job.job_id),{headers:apiHeaders(),cache:"no-store"});
      const data=await progress.json().catch(()=>({}));
      if(!progress.ok)throw new Error(data.error||"No pude consultar el estado");
      if(data.status==="failed")throw new Error(data.error||"ComfyUI no terminó la imagen");
      if(data.status==="queued"){
        imageProgressStage("En cola","La Acer recibió tu pedido y está esperando para procesarlo.");
        $("images-stage").textContent="En cola";
      }else if(data.status==="processing"){
        const detail=data.stage==="finalizing"?"ComfyUI está guardando el resultado…":"El procesador está creando la imagen.";
        imageProgressStage(data.stage==="finalizing"?"Terminando imagen…":"Generando imagen…",detail);
        $("images-stage").textContent="Generando…";
      }
      if(data.status==="completed"){
        completed=true;
        const response=await fetch(state.server+"/api/images/jobs/"+encodeURIComponent(job.job_id)+"/file",{headers:apiHeaders(),cache:"no-store"});
        if(!response.ok)throw new Error("La Acer no devolvió la imagen");
        const blob=await response.blob();
        if(!blob.type.includes("image/png"))throw new Error("El resultado no es una imagen PNG");
        imageSelectedGalleryFile=null;
        imageOutputBlob=blob;imagePreviewUrl=URL.createObjectURL(blob);
        $("image-preview").src=imagePreviewUrl;
        $("image-preview").hidden=false;
        $("image-download").hidden=false;
        $("image-result-status").textContent="¡Imagen terminada! Ya podés descargarla.";
        loadImageGallery();
        break;
      }
      $("image-result-status").textContent="Generando en la Acer · "+imageElapsed((Date.now()-imageProgressStart)/1000)+" transcurridos";
    }
    if(!completed)throw new Error("Se agotó la espera. El trabajo podría seguir ejecutándose en Debian.");
  }catch(err){
    $("image-result-status").textContent="No se pudo generar: "+(err.message||"Error inesperado");
  }finally{
    imageProgressEnd();
    imageBusy=false;
    $("image-repeat").disabled=!imageLastParams;
    $("image-variation").disabled=!imageLastParams;
    if(state.server)refreshImageAvailability();
  }
}
$("image-preset").addEventListener("change",()=>{
  const preset=$("image-preset").value;
  if(preset==="fullbody"||preset==="portrait"||preset==="product"){
    $("image-size").value="512";
    $("image-steps").value="20";
  }
});
$("image-repeat").addEventListener("click",()=>{
  if(imageBusy||!imageLastParams)return;
  const p=imageLastParams;
  $("image-prompt").value=p.prompt;
  $("image-preset").value=p.preset;
  $("image-interpretation").value=p.interpretation||"balanced";
  $("image-size").value=String(p.size);
  $("image-steps").value=String(p.steps);
  $("image-sampler").value=p.sampler;
  const candidates=Array.from($("image-cfg").options);
  candidates.sort((a,b)=>Math.abs(Number(a.value)-p.cfg)-Math.abs(Number(b.value)-p.cfg));
  if(candidates[0])$("image-cfg").value=candidates[0].value;
  $("image-seed").value=String(p.seed);
  generateImage();
});
$("image-variation").addEventListener("click",()=>{
  if(imageBusy||!imageLastParams)return;
  $("image-seed").value="";
  generateImage();
});
$("image-generate").addEventListener("click",generateImage);
$("image-download").addEventListener("click",()=>{
  if(!imageOutputBlob)return;
  const href=URL.createObjectURL(imageOutputBlob),a=document.createElement("a");
  a.href=href;a.download="acer-imagen-"+new Date().toISOString().slice(0,10)+".png";
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
});

let galleryEpoch=0, galleryObjectUrls=[];
let gallerySelected=new Set(), galleryVisibleFiles=[], galleryDeleteEnabled=false;
let imageSelectedGalleryFile=null;
function updateGallerySelection(){
  const count=gallerySelected.size;
  $("image-gallery-count").textContent=count+" imagen"+(count===1?" seleccionada":"es seleccionadas");
  $("image-gallery-delete").disabled=!galleryDeleteEnabled||count===0;
  $("image-gallery-selectall").checked=galleryVisibleFiles.length>0&&count===galleryVisibleFiles.length;
  $("image-gallery-selectall").indeterminate=count>0&&count<galleryVisibleFiles.length;
}
$("image-gallery-selectall").addEventListener("change",()=>{
  const all=$("image-gallery-selectall").checked;
  gallerySelected=new Set(all?galleryVisibleFiles:[]);
  document.querySelectorAll(".image-gallery-pick input").forEach(el=>{
    el.checked=gallerySelected.has(el.value);
    el.closest(".image-gallery-card").classList.toggle("is-selected",el.checked);
  });
  updateGallerySelection();
});
$("image-gallery-delete").addEventListener("click",async()=>{
  if(!galleryDeleteEnabled||!gallerySelected.size||!state.server)return;
  const names=Array.from(gallerySelected);
  if(!confirm("¿Eliminar definitivamente "+names.length+" imagen"+(names.length===1?"":"es")+" de la Acer? Esta acción no se puede deshacer."))return;
  const btn=$("image-gallery-delete"),server=state.server;
  btn.disabled=true;
  $("image-gallery-message").textContent="Eliminando imágenes seleccionadas…";
  try{
    const resp=await fetch(server+"/api/images/gallery/delete",{
      method:"POST",headers:{"Content-Type":"application/json",...apiHeaders()},
      body:JSON.stringify({filenames:names})
    });
    const data=await resp.json().catch(()=>({}));
    if(!resp.ok)throw new Error(data.error||"No pude borrar las imágenes.");
    const deleted=Array.isArray(data.deleted)?data.deleted:[];
    if(deleted.includes(imageSelectedGalleryFile)){
      if(imagePreviewUrl){URL.revokeObjectURL(imagePreviewUrl);imagePreviewUrl=null;}
      imageOutputBlob=null;imageSelectedGalleryFile=null;
      $("image-preview").hidden=true;$("image-download").hidden=true;
      $("image-result-status").textContent="La imagen seleccionada fue eliminada.";
    }
    await loadImageGallery();
    $("image-gallery-message").textContent="Eliminadas: "+deleted.length+
      (Array.isArray(data.failed)&&data.failed.length?". No se pudieron eliminar "+data.failed.length+".":"")+
      ". El borrado es definitivo.";
  }catch(err){
    $("image-gallery-message").textContent=err.message||"Error al eliminar.";
    updateGallerySelection();
  }
});
function clearImageGallery(){
  galleryEpoch++;
  gallerySelected.clear();galleryVisibleFiles=[];galleryDeleteEnabled=false;
  $("image-gallery-toolbar").hidden=true;
  for(const url of galleryObjectUrls)URL.revokeObjectURL(url);
  galleryObjectUrls=[];
  $("image-gallery-grid").replaceChildren();
  $("image-gallery-message").textContent="Conectate a tu Acer para ver las imágenes guardadas.";
}
async function loadImageGallery(){
  if(!state.server)return;
  const epoch=++galleryEpoch,server=state.server;
  gallerySelected.clear();galleryVisibleFiles=[];
  $("image-gallery-toolbar").hidden=true;
  for(const url of galleryObjectUrls)URL.revokeObjectURL(url);
  galleryObjectUrls=[];
  const root=$("image-gallery-grid");
  root.replaceChildren();
  $("image-gallery-message").textContent="Buscando imágenes guardadas en la Acer…";
  try{
    const resp=await fetch(server+"/api/images/gallery",{cache:"no-store",headers:apiHeaders()});
    if(resp.status===404)throw new Error("La Acer necesita la actualización del servidor para mostrar imágenes anteriores.");
    if(!resp.ok)throw new Error("La galería no está disponible (HTTP "+resp.status+").");
    const result=await resp.json();
    if(epoch!==galleryEpoch||state.server!==server)return;
    const items=Array.isArray(result.images)?result.images.slice(0,12):[];
    galleryDeleteEnabled=Boolean(result.delete_enabled);
    galleryVisibleFiles=items.filter(item=>typeof item.filename==="string").map(item=>item.filename);
    $("image-gallery-toolbar").hidden=!items.length;
    updateGallerySelection();
    if(!items.length){$("image-gallery-message").textContent="Todavía no hay imágenes guardadas.";return;}
    $("image-gallery-message").textContent="Mostrando "+items.length+" de "+Number(result.total||items.length)+" imágenes recientes. Tocá una para verla."+
      (galleryDeleteEnabled?" Marcá los casilleros para eliminarlas.":" Para habilitar el borrado falta activar los permisos de escritura en Debian.");
    for(const item of items){
      if(epoch!==galleryEpoch||state.server!==server)return;
      if(typeof item.filename!=="string")continue;
      const wrapper=document.createElement("div");
      wrapper.className="image-gallery-card";
      const card=document.createElement("button");
      card.type="button";card.className="image-gallery-item";
      const pick=document.createElement("label");
      pick.className="image-gallery-pick";
      const check=document.createElement("input");
      check.type="checkbox";check.value=item.filename;
      check.setAttribute("aria-label","Seleccionar imagen "+item.filename);
      check.addEventListener("change",()=>{
        if(check.checked)gallerySelected.add(item.filename);
        else gallerySelected.delete(item.filename);
        wrapper.classList.toggle("is-selected",check.checked);
        updateGallerySelection();
      });
      pick.append(check,document.createTextNode(" Seleccionar"));
      const image=document.createElement("img");
      image.alt="Imagen guardada "+item.filename;
      image.loading="lazy";
      const date=document.createElement("span");
      date.textContent=new Date(Number(item.timestamp)*1000).toLocaleString("es-AR",{dateStyle:"short",timeStyle:"short"});
      if(item.parameters&&Number.isInteger(item.parameters.seed)){
        date.textContent+=" · seed "+item.parameters.seed;
      }
      card.append(image,date);wrapper.append(card,pick);root.append(wrapper);
      try{
        const file=await fetch(server+"/api/images/gallery/"+encodeURIComponent(item.filename),{headers:apiHeaders(),cache:"no-store"});
        if(!file.ok)throw new Error("No disponible");
        const blob=await file.blob();
        if(epoch!==galleryEpoch||state.server!==server)return;
        if(!blob.type.includes("image/png"))throw new Error("No es PNG");
        const url=URL.createObjectURL(blob);
        galleryObjectUrls.push(url);
        image.src=url;
        card.addEventListener("click",()=>{
          imageSelectedGalleryFile=item.filename;
          if(imagePreviewUrl)URL.revokeObjectURL(imagePreviewUrl);
          imagePreviewUrl=URL.createObjectURL(blob);
          imageOutputBlob=blob;
          $("image-preview").src=imagePreviewUrl;
          $("image-preview").hidden=false;
          $("image-download").hidden=false;
          if(item.parameters&&typeof item.parameters==="object"){
            const data=item.parameters;
            if(typeof data.prompt==="string"&&data.prompt) $("image-prompt").value=data.prompt;
            if(Number.isInteger(data.seed)) $("image-seed").value=String(data.seed);
            if([8,15,20,28].includes(data.steps)) $("image-steps").value=String(data.steps);
            if([384,512].includes(data.width)) $("image-size").value=String(data.width);
            if(["euler","euler_ancestral","dpmpp_2m"].includes(data.sampler)) $("image-sampler").value=data.sampler;
            if(Number.isFinite(data.cfg)) {
              const opts=Array.from($("image-cfg").options);
              opts.sort((a,b)=>Math.abs(Number(a.value)-data.cfg)-Math.abs(Number(b.value)-data.cfg));
              if(opts[0])$("image-cfg").value=opts[0].value;
            }
            $("image-preset").value="auto";
            if(Number.isInteger(data.seed)){
              imageLastSeed=data.seed;
              imageLastParams={
                prompt:typeof data.prompt==="string"?data.prompt:$("image-prompt").value,
                seed:data.seed,preset:"auto",interpretation:"balanced",
                sampler:["euler","euler_ancestral","dpmpp_2m"].includes(data.sampler)?data.sampler:"dpmpp_2m",
                cfg:Number.isFinite(data.cfg)?data.cfg:6.5,
                steps:[8,15,20,28].includes(data.steps)?data.steps:20,
                size:[384,512].includes(data.width)?data.width:512
              };
              $("image-repeat").disabled=false;
              $("image-variation").disabled=false;
            }
            $("image-last-settings").textContent="Imagen recuperada · "+(data.model||"SD 1.5")+" · seed "+(data.seed??"no disponible")+" · "+(data.steps??"?")+" pasos";
          }
          $("image-result-status").textContent="Imagen recuperada: "+item.filename;
          $("image-preview").scrollIntoView({behavior:"smooth",block:"center"});
        });
      }catch{
        card.disabled=true;
        date.textContent="Vista previa no disponible";
      }
    }
  }catch(err){
    if(epoch!==galleryEpoch)return;
    $("image-gallery-message").textContent=err.message||"No se pudo cargar la galería.";
  }
}
$("image-gallery-refresh").addEventListener("click",loadImageGallery);
$("image-copy").addEventListener("click",async()=>{
  const description=$("image-prompt").value.trim();
  const label=$("image-copy-status");
  if(!description){label.textContent="Escribí primero una descripción.";return;}
  try{await navigator.clipboard.writeText(description);label.textContent="Descripción copiada.";}
  catch{label.textContent="No se pudo copiar. Seleccioná el texto para copiarlo manualmente.";}
});
$("image-prompt").addEventListener("input",()=>{$("image-copy-status").textContent="";});
$("code-language").addEventListener("change",()=>{
  const current=$("code-filename").value.trim();
  if(!current||Object.values(filenameByLanguage).includes(current)){
    $("code-filename").value=filenameByLanguage[$("code-language").value]||"archivo.txt";
  }
});
$("copy-code").addEventListener("click",async()=>{
  const source=generatedCode();
  if(!source)return;
  try{
    await navigator.clipboard.writeText(source);
    $("code-status").textContent="Código copiado";
  }catch{
    $("code-status").textContent="No se pudo copiar. Seleccioná el texto manualmente.";
  }
});
$("download-code").addEventListener("click",()=>{
  const source=generatedCode();if(!source)return;
  let name=$("code-filename").value.trim().replace(/[^a-zA-Z0-9._-]/g,"_").replace(/^\.+/,"").slice(0,70);
  if(!name||name==="."||name==="..")name=filenameByLanguage[$("code-language").value]||"codigo.txt";
  const blob=new Blob([source+"\n"],{type:"text/plain;charset=utf-8"});
  const href=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=href;link.download=name;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
  $("code-status").textContent="Descargado: "+name;
});
selectMode("finance");