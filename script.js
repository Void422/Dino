const ui = {
  canvas: document.getElementById("canvas"),
  ctx: null,
  groupSelect: document.getElementById("groupSelect"),
  bodyGrid: document.getElementById("bodyGrid"),
  bodyCount: document.getElementById("bodyCount"),
  bellyButtons: document.getElementById("bellyButtons")
}

let info, baseImg, bodyMaskImg, bellyMaskImg
let bodyColor, bellyColor, outlineGuard
let baseBox, bodyBox, bellyBox
let offMain, offBody, offBelly, mainCtx, bodyCtx, bellyCtx

fetch("info.json").then(r=>r.json()).then(json=>{
  info = json
  bodyColor = info.defaults.body
  bellyColor = info.defaults.belly
  outlineGuard = info.defaults.outlineGuard ?? 0.4
  loadImages(info.images)
})

function loadImages(s) {
  baseImg = new Image()
  bodyMaskImg = new Image()
  bellyMaskImg = new Image()
  baseImg.crossOrigin = bodyMaskImg.crossOrigin = bellyMaskImg.crossOrigin = "anonymous"
  baseImg.src = s.base
  bodyMaskImg.src = s.maskBody
  bellyMaskImg.src = s.maskBelly
  let ready = 0
  const done = () => { if(++ready<3) return; initCanvases() }
  baseImg.onload = done; bodyMaskImg.onload = done; bellyMaskImg.onload = done
}

function initCanvases() {
  ui.ctx = ui.canvas.getContext("2d", { willReadFrequently: true })
  const w = baseImg.naturalWidth, h = baseImg.naturalHeight
  ui.canvas.width = w; ui.canvas.height = h

  offMain = document.createElement("canvas")
  offBody = document.createElement("canvas")
  offBelly = document.createElement("canvas")
  offMain.width = w; offMain.height = h
  offBody.width = w; offBody.height = h
  offBelly.width = w; offBelly.height = h

  mainCtx = offMain.getContext("2d", { willReadFrequently: true })
  bodyCtx = offBody.getContext("2d", { willReadFrequently: true })
  bellyCtx = offBelly.getContext("2d", { willReadFrequently: true })

  baseBox = findBox(baseImg)
  bodyBox = findBox(bodyMaskImg)
  bellyBox = findBox(bellyMaskImg)

  buildBodySet("N")
  buildBellyButtons(info.bellyPresets)
  ui.groupSelect.onchange = e => buildBodySet(e.target.value)
  drawAll()
}

function findBox(img) {
  const c = document.createElement("canvas")
  const cx = c.getContext("2d", { willReadFrequently: true })
  c.width = img.naturalWidth; c.height = img.naturalHeight
  cx.drawImage(img, 0, 0)
  const d = cx.getImageData(0, 0, c.width, c.height).data
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1
  for (let y=0; y<c.height; y++) {
    for (let x=0; x<c.width; x++) {
      const a = d[(y*c.width + x)*4 + 3]
      if (a>10) { if (x<minX) minX=x; if (y<minY) minY=y; if (x>maxX) maxX=x; if (y>maxY) maxY=y }
    }
  }
  if (maxX<0) return { x:0, y:0, w:c.width, h:c.height }
  return { x:minX, y:minY, w:maxX-minX+1, h:maxY-minY+1 }
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#',''), 16)
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 }
}

function light(r,g,b) {
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b)
  return (mx+mn)/510
}

function pickAlpha(ctx,w,h) {
  const d = ctx.getImageData(0,0,w,h).data
  const a = new Uint8ClampedArray(w*h)
  for (let i=0,j=0; i<d.length; i+=4, j++) a[j] = d[i+3]
  return a
}

function putAlpha(a,w,h) {
  const out = new ImageData(w,h)
  const d = out.data
  for (let j=0,i=0; j<a.length; j++, i+=4) { d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=a[j] }
  return out
}

function erode(a,w,h) {
  const r = new Uint8ClampedArray(a.length)
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    let m = 255
    for (let yy=-1;yy<=1;yy++) for (let xx=-1;xx<=1;xx++) {
      const nx=x+xx, ny=y+yy
      if (nx<0||ny<0||nx>=w||ny>=h) continue
      const v = a[ny*w+nx]; if (v<m) m=v
    }
    r[y*w+x] = m
  }
  return r
}

function blur(a,w,h) {
  const t = new Float32Array(a.length), r = new Uint8ClampedArray(a.length)
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) {
    let s=0,c=0
    for (let yy=-1;yy<=1;yy++) for (let xx=-1;xx<=1;xx++) {
      const nx=x+xx, ny=y+yy
      if (nx<0||ny<0||nx>=w||ny>=h) continue
      s+=a[ny*w+nx]; c++
    }
    t[y*w+x]=s/c
  }
  for (let i=0;i<t.length;i++) r[i]=t[i]
  return r
}

function refineMask(ctx,w,h) {
  const a0 = pickAlpha(ctx,w,h)
  const a1 = erode(a0,w,h)
  const a2 = blur(a1,w,h)
  return putAlpha(a2,w,h)
}

function colorRegion(imgData, maskData, hex, original) {
  const bd = imgData.data, md = maskData.data, od = original.data
  const keep = outlineGuard
  const {r:rr,g:gg,b:bb} = hexToRgb(hex)
  for (let i=0;i<bd.length;i+=4) {
    const ma = md[i+3]
    if (ma<=2) continue
    if (bd[i+3]<=10) continue
    const l = light(od[i],od[i+1],od[i+2])
    if (l<=keep) continue
    const w = ma/255
    bd[i]   = Math.round(bd[i]*(1-w) + rr*w)
    bd[i+1] = Math.round(bd[i+1]*(1-w) + gg*w)
    bd[i+2] = Math.round(bd[i+2]*(1-w) + bb*w)
  }
}

function drawAll() {
  mainCtx.clearRect(0,0,offMain.width,offMain.height)
  bodyCtx.clearRect(0,0,offBody.width,offBody.height)
  bellyCtx.clearRect(0,0,offBelly.width,offBelly.height)

  mainCtx.drawImage(baseImg,0,0,offMain.width,offMain.height)

  bodyCtx.drawImage(bodyMaskImg,  bodyBox.x,  bodyBox.y,  bodyBox.w,  bodyBox.h,  baseBox.x, baseBox.y, baseBox.w, baseBox.h)
  bellyCtx.drawImage(bellyMaskImg, bellyBox.x, bellyBox.y, bellyBox.w, bellyBox.h, baseBox.x, baseBox.y, baseBox.w, baseBox.h)

  const baseData = mainCtx.getImageData(0,0,offMain.width,offMain.height)
  const origData = mainCtx.getImageData(0,0,offMain.width,offMain.height)

  const bellyMask = refineMask(bellyCtx, offBelly.width, offBelly.height)
  const bodyMask  = refineMask(bodyCtx,  offBody.width,  offBody.height)

  colorRegion(baseData, bellyMask, bellyColor, origData)
  colorRegion(baseData, bodyMask,  bodyColor,  origData)

  mainCtx.putImageData(baseData,0,0)
  ui.ctx.clearRect(0,0,ui.canvas.width,ui.canvas.height)
  ui.ctx.drawImage(offMain,0,0)
}

function buildBodySet(groupKey) {
  const list = info.bodySets[groupKey]
  ui.bodyGrid.innerHTML = ""
  const have = list.filter(i=>i.on).length
  ui.bodyCount.textContent = `Available ${have}/${list.length}`
  list.forEach(item=>{
    const card = document.createElement("div")
    card.className = "swatch" + (item.on ? "" : " s-off")
    const dot = document.createElement("div")
    dot.className = "dot"
    dot.style.background = item.hex || "#fff"
    const meta = document.createElement("div")
    meta.className = "meta"
    const title = item.on ? `${item.id} • ${item.name}` : `${item.id} • Missing`
    const code = item.on ? item.hex : "—"
    meta.innerHTML = `<div class="name">${title}</div><div>${code}</div>`
    card.appendChild(dot); card.appendChild(meta)
    if (item.on) card.onclick = ()=>{ bodyColor = item.hex; drawAll() }
    ui.bodyGrid.appendChild(card)
  })
}

function buildBellyButtons(list) {
  ui.bellyButtons.innerHTML = ""
  list.forEach(b=>{
    const btn = document.createElement("button")
    btn.textContent = `${b.id} • ${b.name}`
    btn.onclick = ()=>{ bellyColor = b.hex; drawAll() }
    ui.bellyButtons.appendChild(btn)
  })
}
