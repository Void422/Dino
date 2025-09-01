const ui={
  canvas:document.getElementById("canvas"),
  ctx:null,
  groupSelect:document.getElementById("groupSelect"),
  bellySelect:document.getElementById("bellySelect"),
  bodyGrid:document.getElementById("bodyGrid"),
  bellyGrid:document.getElementById("bellyGrid"),
  designGrid:document.getElementById("designGrid"),
  bodyCount:document.getElementById("bodyCount"),
  bellyCount:document.getElementById("bellyCount"),
  designCount:document.getElementById("designCount")
}

let info, baseImg, maskBodyImg, maskBellyImg
let bodyHex, bellyHex, guard
let w,h, baseBox, bodyBox, bellyBox
let main, layerBody, layerBelly, layerDesign, mainCtx, bodyCtx, bellyCtx, designCtx
let maskBodyAligned, maskBellyAligned, lightMask
let designImgs={}, designSel="none"
let needs

fetch("info.json").then(r=>r.json()).then(j=>{
  info=j
  bodyHex=info.defaults.body
  bellyHex=info.defaults.belly
  guard=info.defaults.outlineGuard??0.4
  return loadAll(info.images, info.designs)
}).then(init)

async function loadOne(src){
  if(!src) return null
  if('createImageBitmap'in self){
    try{
      const res=await fetch(src,{cache:'force-cache'})
      const b=await res.blob()
      return await createImageBitmap(b)
    }catch(e){}
  }
  return await new Promise((ok,err)=>{
    const i=new Image()
    i.crossOrigin="anonymous"
    i.onload=()=>ok(i)
    i.onerror=err
    i.src=src
  })
}
async function loadAll(imgs,designs){
  const [a,b,c]=await Promise.all([loadOne(imgs.base),loadOne(imgs.maskBody),loadOne(imgs.maskBelly)])
  baseImg=a; maskBodyImg=b; maskBellyImg=c
  const tasks=(designs||[]).filter(d=>d.src).map(async d=>{designImgs[d.id]=await loadOne(d.src)})
  await Promise.all(tasks)
}

function init(){
  w=(baseImg.width||baseImg.naturalWidth); h=(baseImg.height||baseImg.naturalHeight)
  ui.ctx=ui.canvas.getContext("2d",{willReadFrequently:true})
  ui.canvas.width=w; ui.canvas.height=h

  main=mkCanvas(w,h); layerBody=mkCanvas(w,h); layerBelly=mkCanvas(w,h); layerDesign=mkCanvas(w,h)
  mainCtx=main.getContext("2d",{willReadFrequently:true})
  bodyCtx=layerBody.getContext("2d",{willReadFrequently:true})
  bellyCtx=layerBelly.getContext("2d",{willReadFrequently:true})
  designCtx=layerDesign.getContext("2d",{willReadFrequently:true})

  baseBox=findBox(baseImg); bodyBox=findBox(maskBodyImg); bellyBox=findBox(maskBellyImg)
  maskBodyAligned=alignMask(maskBodyImg,bodyBox,baseBox,w,h)
  maskBellyAligned=alignMask(maskBellyImg,bellyBox,baseBox,w,h)
  maskBodyAligned=refine(maskBodyAligned)
  maskBellyAligned=refine(maskBellyAligned)
  lightMask=makeLightMask(baseImg,guard,w,h)

  buildBody("N"); buildBelly("N"); buildDesigns()
  ui.groupSelect.onchange=e=>buildBody(e.target.value)
  ui.bellySelect.onchange=e=>buildBelly(e.target.value)
  draw()
}

function mkCanvas(w,h){
  return ('OffscreenCanvas'in self)?new OffscreenCanvas(w,h):Object.assign(document.createElement('canvas'),{width:w,height:h})
}

function findBox(img){
  const c=mkCanvas(img.width||img.naturalWidth,img.height||img.naturalHeight)
  const cx=c.getContext('2d',{willReadFrequently:true})
  cx.drawImage(img,0,0)
  const d=cx.getImageData(0,0,c.width,c.height).data
  let minX=c.width,minY=c.height,maxX=-1,maxY=-1
  for(let y=0;y<c.height;y++){
    for(let x=0;x<c.width;x++){
      const a=d[(y*c.width+x)*4+3]
      if(a>10){ if(x<minX)minX=x; if(y<minY)minY=y; if(x>maxX)maxX=x; if(y>maxY)maxY=y }
    }
  }
  if(maxX<0) return {x:0,y:0,w:c.width,h:c.height}
  return {x:minX,y:minY,w:maxX-minX+1,h:maxY-minY+1}
}

function alignMask(src,srcBox,dstBox,w,h){
  const c=mkCanvas(w,h), cx=c.getContext('2d',{willReadFrequently:true})
  cx.drawImage(src,srcBox.x,srcBox.y,srcBox.w,srcBox.h,dstBox.x,dstBox.y,dstBox.w,dstBox.h)
  return c
}

function refine(c){
  const cx=c.getContext('2d',{willReadFrequently:true})
  const id=cx.getImageData(0,0,c.width,c.height), a=id.data
  const w=c.width, h=c.height, alpha=new Uint8ClampedArray(w*h)
  for(let i=0,j=0;i<a.length;i+=4,j++) alpha[j]=a[i+3]
  const er=erode(alpha,w,h), bl=blur(er,w,h)
  const out=cx.createImageData(w,h)
  for(let j=0,i=0;j<bl.length;j++,i+=4){out.data[i]=0;out.data[i+1]=0;out.data[i+2]=0;out.data[i+3]=bl[j]}
  cx.clearRect(0,0,w,h); cx.putImageData(out,0,0)
  return c
}

function makeLightMask(img,threshold,w,h){
  const c=mkCanvas(w,h), cx=c.getContext('2d',{willReadFrequently:true})
  cx.drawImage(img,0,0,w,h)
  const id=cx.getImageData(0,0,w,h), d=id.data
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2]
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b)
    const L=(mx+mn)/510
    d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=L>threshold?255:0
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

function tintTo(ctx,hex){
  const w=ctx.canvas.width,h=ctx.canvas.height
  ctx.globalCompositeOperation='source-in'
  ctx.fillStyle=hex
  ctx.fillRect(0,0,w,h)
  ctx.globalCompositeOperation='source-over'
}

function draw(){
  mainCtx.clearRect(0,0,w,h)
  bodyCtx.clearRect(0,0,w,h)
  bellyCtx.clearRect(0,0,w,h)
  designCtx.clearRect(0,0,w,h)

  mainCtx.drawImage(baseImg,0,0,w,h)

  bodyCtx.fillStyle=bodyHex
  bodyCtx.fillRect(0,0,w,h)
  bodyCtx.globalCompositeOperation='destination-in'
  bodyCtx.drawImage(maskBodyAligned,0,0)
  bodyCtx.drawImage(lightMask,0,0)
  bodyCtx.globalCompositeOperation='source-over'

  bellyCtx.fillStyle=bellyHex
  bellyCtx.fillRect(0,0,w,h)
  bellyCtx.globalCompositeOperation='destination-in'
  bellyCtx.drawImage(maskBellyAligned,0,0)
  bellyCtx.drawImage(lightMask,0,0)
  bellyCtx.globalCompositeOperation='source-over'

  if(designSel!=="none"){
    const dObj=info.designs.find(d=>d.id===designSel)
    const dImg=designImgs[designSel]
    if(dObj && dImg){
      const db=findBox(dImg)
      const aligned=alignMask(dImg,db,baseBox,w,h)
      designCtx.drawImage(aligned,0,0)
      if(dObj.mode==="body") tintTo(designCtx,bodyHex)
      else if(dObj.mode==="belly") tintTo(designCtx,bellyHex)
      else if(dObj.mode==="fixed" && dObj.hex) tintTo(designCtx,dObj.hex)
    }
  }

  mainCtx.drawImage(layerBelly,0,0)
  mainCtx.drawImage(layerBody,0,0)
  mainCtx.drawImage(layerDesign,0,0)

  ui.ctx.clearRect(0,0,w,h)
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

function buildDesigns(){
  const list=info.designs||[], have=list.filter(i=>i.on).length
  ui.designGrid.innerHTML=""
  ui.designCount.textContent=`Available ${have}/${list.length}`
  for(const it of list){
    const hex=it.hex||"#000"
    const title=it.id==='none'?'None':it.name
    const sub=it.on?(it.mode==='fixed'?hex:it.mode):"—"
    const card=row(hex,it.on,`${it.id} • ${title}`,sub)
    if(it.on) card.onclick=()=>{designSel=it.id; req()}
    ui.designGrid.appendChild(card)
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

function req(){
  if(needs) return
  needs=requestAnimationFrame(()=>{needs=0; draw()})
}

window.addEventListener("orientationchange",()=>setTimeout(draw,200))
