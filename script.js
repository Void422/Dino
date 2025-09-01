const ui={
  canvas:document.getElementById("canvas"),
  ctx:null,
  groupSelect:document.getElementById("groupSelect"),
  bellySelect:document.getElementById("bellySelect"),
  bodyGrid:document.getElementById("bodyGrid"),
  bellyGrid:document.getElementById("bellyGrid"),
  bodyCount:document.getElementById("bodyCount"),
  bellyCount:document.getElementById("bellyCount"),
  menuBtn:document.getElementById("menuBtn"),
  drawer:document.getElementById("drawer"),
  scrim:document.getElementById("scrim"),
  closeDrawer:document.getElementById("closeDrawer"),
  groupSelectMobile:document.getElementById("groupSelectMobile"),
  bellySelectMobile:document.getElementById("bellySelectMobile")
}

let info, baseImg, maskBodyImg, maskBellyImg
let bodyHex, bellyHex, guard
let w,h, baseBox, bodyBox, bellyBox
let main, layerBody, layerBelly, mainCtx, bodyCtx, bellyCtx
let maskBodyAligned, maskBellyAligned, lightMask
let needs

fetch("info.json").then(r=>r.json()).then(j=>{
  info=j
  bodyHex=info.defaults.body
  bellyHex=info.defaults.belly
  guard=info.defaults.outlineGuard??0.4
  return loadAll(info.images)
}).then(init)

async function loadOne(src){
  if('createImageBitmap'in self){
    try{const res=await fetch(src,{cache:'force-cache'});const b=await res.blob();return await createImageBitmap(b)}catch(e){}
  }
  return await new Promise((ok,err)=>{const i=new Image();i.crossOrigin="anonymous";i.onload=()=>ok(i);i.onerror=err;i.src=src})
}
async function loadAll(imgs){
  const [a,b,c]=await Promise.all([loadOne(imgs.base),loadOne(imgs.maskBody),loadOne(imgs.maskBelly)])
  baseImg=a; maskBodyImg=b; maskBellyImg=c
}

function init(){
  w=(baseImg.width||baseImg.naturalWidth); h=(baseImg.height||baseImg.naturalHeight)
  ui.ctx=ui.canvas.getContext("2d",{willReadFrequently:true})
  ui.canvas.width=w; ui.canvas.height=h

  main=mk(w,h); layerBody=mk(w,h); layerBelly=mk(w,h)
  mainCtx=main.getContext("2d",{willReadFrequently:true})
  bodyCtx=layerBody.getContext("2d",{willReadFrequently:true})
  bellyCtx=layerBelly.getContext("2d",{willReadFrequently:true})

  baseBox=box(baseImg); bodyBox=box(maskBodyImg); bellyBox=box(maskBellyImg)
  maskBodyAligned=align(maskBodyImg,bodyBox,baseBox,w,h)
  maskBellyAligned=align(maskBellyImg,bellyBox,baseBox,w,h)
  maskBodyAligned=refine(maskBodyAligned)
  maskBellyAligned=refine(maskBellyAligned)
  lightMask=light(baseImg,guard,w,h)

  buildBody("N"); buildBelly("N")
  ui.groupSelect.onchange=e=>{ui.groupSelectMobile.value=e.target.value;buildBody(e.target.value)}
  ui.bellySelect.onchange=e=>{ui.bellySelectMobile.value=e.target.value;buildBelly(e.target.value)}
  ui.groupSelectMobile.onchange=e=>{ui.groupSelect.value=e.target.value;buildBody(e.target.value)}
  ui.bellySelectMobile.onchange=e=>{ui.bellySelect.value=e.target.value;buildBelly(e.target.value)}

  ui.menuBtn.onclick=toggleDrawer
  ui.scrim.onclick=closeDrawer
  ui.closeDrawer.onclick=closeDrawer

  draw()
}

function toggleDrawer(){ ui.drawer.classList.toggle("open"); ui.scrim.classList.toggle("show") }
function closeDrawer(){ ui.drawer.classList.remove("open"); ui.scrim.classList.remove("show") }

function mk(w,h){return ('OffscreenCanvas'in self)?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h})}
function box(img){
  const c=mk(img.width||img.naturalWidth,img.height||img.naturalHeight)
  const cx=c.getContext('2d',{willReadFrequently:true})
  cx.drawImage(img,0,0)
  const d=cx.getImageData(0,0,c.width,c.height).data
  let minX=c.width,minY=c.height,maxX=-1,maxY=-1
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
    const a=d[(y*c.width+x)*4+3]
    if(a>10){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y }
  }
  if(maxX<0) return {x:0,y:0,w:c.width,h:c.height}
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}
}
function align(src,srcBox,dstBox,w,h){
  const c=mk(w,h), cx=c.getContext('2d',{willReadFrequently:true})
  cx.drawImage(src,srcBox.x,srcBox.y,srcBox.w,srcBox.h,dstBox.x,dstBox.y,dstBox.w,dstBox.h)
  return c
}
function refine(c){
  const cx=c.getContext('2d',{willReadFrequently:true})
  const id=cx.getImageData(0,0,c.width,c.height), a=id.data
  const w=c.width,h=c.height, alpha=new Uint8ClampedArray(w*h)
  for(let i=0,j=0;i<a.length;i+=4,j++) alpha[j]=a[i+3]
  const er=erode(alpha,w,h), bl=blur(er,w,h)
  const out=cx.createImageData(w,h)
  for(let j=0,i=0;j<bl.length;j++,i+=4){out.data[i]=0;out.data[i+1]=0;out.data[i+2]=0;out.data[i+3]=bl[j]}
  cx.clearRect(0,0,w,h); cx.putImageData(out,0,0)
  return c
}
function light(img,t,w,h){
  const c=mk(w,h), cx=c.getContext('2d',{willReadFrequently:true})
  cx.drawImage(img,0,0,w,h)
  const id=cx.getImageData(0,0,w,h), d=id.data
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2]
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b)
    const L=(mx+mn)/510
    d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=L>t?255:0
  }
  cx.putImageData(id,0,0); return c
}
function erode(a,w,h){
  const r=new Uint8ClampedArray(a.length)
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    let m=255
    for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++){
      const nx=x+xx, ny=y+yy
      if(nx<0||ny<0||nx>=w||ny>=h) continue
      const v=a[ny*w+nx]; if(v<m) m=v
    }
    r[y*w+x]=m
  }
  return r
}
function blur(a,w,h){
  const t=new Float32Array(a.length), r=new Uint8ClampedArray(a.length)
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    let s=0,c=0
    for(let yy=-1;yy<=1;yy++) for(let xx=-1;xx<=1;xx++){
      const nx=x+xx, ny=y+yy
      if(nx<0||ny<0||nx>=w||ny>=h) continue
      s+=a[ny*w+nx]; c++
    }
    t[y*w+x]=s/c
  }
  for(let i=0;i<t.length;i++) r[i]=t[i]
  return r
}

function draw(){
  const w0=w,h0=h
  mainCtx.clearRect(0,0,w0,h0)
  bodyCtx.clearRect(0,0,w0,h0)
  bellyCtx.clearRect(0,0,w0,h0)

  mainCtx.drawImage(baseImg,0,0,w0,h0)

  bodyCtx.fillStyle=bodyHex
  bodyCtx.fillRect(0,0,w0,h0)
  bodyCtx.globalCompositeOperation='destination-in'
  bodyCtx.drawImage(maskBodyAligned,0,0)
  bodyCtx.drawImage(lightMask,0,0)
  bodyCtx.globalCompositeOperation='source-over'

  bellyCtx.fillStyle=bellyHex
  bellyCtx.fillRect(0,0,w0,h0)
  bellyCtx.globalCompositeOperation='destination-in'
  bellyCtx.drawImage(maskBellyAligned,0,0)
  bellyCtx.drawImage(lightMask,0,0)
  bellyCtx.globalCompositeOperation='source-over'

  mainCtx.drawImage(layerBelly,0,0)
  mainCtx.drawImage(layerBody,0,0)

  ui.ctx.clearRect(0,0,w0,h0)
  ui.ctx.drawImage(main,0,0)
}

function buildBody(key){
  const list=info.bodySets[key], have=list.filter(i=>i.on).length
  ui.bodyGrid.innerHTML=""
  ui.bodyCount.textContent=`Available ${have}/${list.length}`
  for(const it of list){
    const card=row(it.hex,it.on,`${it.id} • ${it.name}`,it.on?it.hex:"—")
    if(it.on) card.onclick=()=>{bodyHex=it.hex; req()}
    ui.bodyGrid.appendChild(card)
  }
}
function buildBelly(key){
  const list=info.bellySets[key], have=list.filter(i=>i.on).length
  ui.bellyGrid.innerHTML=""
  ui.bellyCount.textContent=`Available ${have}/${list.length}`
  for(const it of list){
    const card=row(it.hex,it.on,`${it.id} • ${it.name||"Belly"}`,it.on?it.hex:"—")
    if(it.on) card.onclick=()=>{bellyHex=it.hex; req()}
    ui.bellyGrid.appendChild(card)
  }
}
function row(color,on,title,sub){
  const card=document.createElement("div")
  card.className="swatch"+(on?"":" s-off")
  const dot=document.createElement("div")
  dot.className="dot"
  dot.style.background=color||"#fff"
  const meta=document.createElement("div")
  meta.className="meta"
  meta.innerHTML=`<div class="name">${title}</div><div>${sub}</div>`
  card.appendChild(dot); card.appendChild(meta)
  return card
}
function req(){ if(needs) return; needs=requestAnimationFrame(()=>{needs=0; draw()}) }

window.addEventListener("orientationchange",()=>setTimeout(draw,200))
