import { scanKit } from '@shared/scan-kit'

/**
 * The scanner page the phone opens: one self-contained HTML file (no CDN, no tracking), so it
 * works in any phone browser with nothing to install.
 *
 * Phones only allow a live camera on secure (https) pages and this page is plain http on the
 * home network, so photos come from the phone's own camera app (its flash and flip work there).
 * After each photo the page finds the paper's edges, lets you nudge the corners, straightens and
 * cleans the page, sends it to the computer straight away, and can open the camera again for the
 * next page.
 *
 * Keep the script free of backticks, `${` and backslashes: it lives inside a template string.
 */
export const SCANNER_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<meta name="theme-color" content="#0f1012">
<title>Atlas Scan</title>
<style>
  :root { --bg:#f4f4f1; --card:#ffffff; --ink:#15171a; --ink2:#5b616b; --ink3:#8b9099; --line:#e4e4df; --blue:#2f6bff; --ok:#1f9d55; --bad:#d64545; --dark:#0f1012; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0f1012; --card:#191b1f; --ink:#f3f3f0; --ink2:#a5aab2; --ink3:#767b84; --line:#2a2d32; } }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; margin: 0; }
  html, body { height: 100%; }
  body { background: var(--bg); color: var(--ink); font: 16px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; overscroll-behavior: none; }
  button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; }
  svg { display: block; }
  .screen { position: fixed; inset: 0; display: none; flex-direction: column; }
  .screen.on { display: flex; }

  /* Home */
  #home { overflow-y: auto; padding: calc(env(safe-area-inset-top) + 20px) 20px calc(env(safe-area-inset-bottom) + 112px); }
  .top { display: flex; align-items: center; gap: 10px; }
  .logo { width: 34px; height: 34px; border-radius: 10px; background: var(--ink); color: var(--bg); display: grid; place-items: center; }
  .brand { font-weight: 650; font-size: 17px; letter-spacing: -.01em; }
  .pill { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink2); background: var(--card); padding: 6px 10px; border-radius: 99px; box-shadow: 0 0 0 1px var(--line) inset; }
  .dot { width: 7px; height: 7px; border-radius: 99px; background: var(--ok); }
  .pill.off .dot { background: var(--bad); }
  h1 { font-size: 30px; line-height: 1.1; font-weight: 700; letter-spacing: -.025em; margin-top: 28px; }
  .lede { color: var(--ink2); margin-top: 8px; font-size: 15px; }
  .capture { margin-top: 24px; width: 100%; aspect-ratio: 1.45; border-radius: 22px; background: var(--dark); color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; position: relative; overflow: hidden; }
  .capture .frame { position: absolute; inset: 22px 36px; border-radius: 10px; }
  .capture .frame i { position: absolute; width: 22px; height: 22px; border-color: rgba(255,255,255,.75); border-style: solid; }
  .capture .frame i:nth-child(1) { left: 0; top: 0; border-width: 2.5px 0 0 2.5px; border-top-left-radius: 8px; }
  .capture .frame i:nth-child(2) { right: 0; top: 0; border-width: 2.5px 2.5px 0 0; border-top-right-radius: 8px; }
  .capture .frame i:nth-child(3) { right: 0; bottom: 0; border-width: 0 2.5px 2.5px 0; border-bottom-right-radius: 8px; }
  .capture .frame i:nth-child(4) { left: 0; bottom: 0; border-width: 0 0 2.5px 2.5px; border-bottom-left-radius: 8px; }
  .shutter { width: 64px; height: 64px; border-radius: 99px; border: 3px solid #fff; display: grid; place-items: center; }
  .shutter span { width: 50px; height: 50px; border-radius: 99px; background: #fff; }
  .capture b { font-weight: 600; font-size: 16px; }
  .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .soft { background: var(--card); border-radius: 16px; padding: 14px; display: flex; align-items: center; gap: 10px; font-weight: 550; font-size: 15px; box-shadow: 0 0 0 1px var(--line) inset; }
  .soft svg { width: 20px; height: 20px; color: var(--ink2); flex: none; }
  .label { font-size: 13px; font-weight: 600; color: var(--ink2); text-transform: uppercase; letter-spacing: .04em; margin: 28px 2px 10px; display: flex; justify-content: space-between; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .thumb { position: relative; aspect-ratio: .75; border-radius: 12px; overflow: hidden; background: var(--card); box-shadow: 0 0 0 1px var(--line) inset; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .thumb .n { position: absolute; left: 6px; top: 6px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 99px; background: rgba(15,16,18,.72); color: #fff; font-size: 12px; font-weight: 650; display: grid; place-items: center; }
  .thumb .s { position: absolute; right: 6px; bottom: 6px; width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; background: rgba(15,16,18,.72); color: #fff; }
  .thumb .s.ok { background: var(--ok); }
  .thumb .s.bad { background: var(--bad); }
  .thumb .s svg { width: 13px; height: 13px; }
  .spin { width: 12px; height: 12px; border-radius: 99px; border: 2px solid rgba(255,255,255,.35); border-top-color: #fff; animation: r .8s linear infinite; }
  @keyframes r { to { transform: rotate(360deg); } }
  .empty { color: var(--ink3); font-size: 14px; padding: 26px 0; text-align: center; border: 1.5px dashed var(--line); border-radius: 16px; }
  .err { color: var(--bad); font-size: 14px; margin-top: 12px; min-height: 1px; }
  .dock { position: fixed; left: 0; right: 0; bottom: 0; padding: 12px 20px calc(env(safe-area-inset-bottom) + 14px); background: linear-gradient(to top, var(--bg) 70%, transparent); }
  .primary { width: 100%; height: 54px; border-radius: 16px; background: var(--blue); color: #fff; font-weight: 650; font-size: 16px; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .primary:disabled { opacity: .4; }
  .primary.ink { background: var(--ink); color: var(--bg); }

  /* Edit */
  #edit { background: var(--dark); color: #fff; }
  .ebar { display: flex; align-items: center; padding: calc(env(safe-area-inset-top) + 10px) 12px 10px; gap: 4px; }
  .ebar .t { flex: 1; text-align: center; font-weight: 600; font-size: 16px; }
  .ghost { height: 38px; padding: 0 12px; border-radius: 10px; color: rgba(255,255,255,.88); font-size: 15px; font-weight: 550; }
  .ghost:active { background: rgba(255,255,255,.1); }
  .stage { flex: 1; position: relative; margin: 0 14px; touch-action: none; }
  .stage img, .stage canvas { position: absolute; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
  .stage svg { position: absolute; overflow: visible; }
  .handle { fill: rgba(47,107,255,.18); stroke: #fff; stroke-width: 2.5; }
  .busy { position: absolute; inset: 0; display: none; place-items: center; color: rgba(255,255,255,.8); font-size: 14px; }
  .busy.on { display: grid; }
  .tools { display: flex; gap: 6px; padding: 14px 14px 4px; overflow-x: auto; scrollbar-width: none; }
  .tools > :first-child { margin-left: auto; }
  .tools > :last-child { margin-right: auto; }
  .chip { height: 36px; padding: 0 14px; border-radius: 99px; background: rgba(255,255,255,.1); color: rgba(255,255,255,.85); font-size: 14px; font-weight: 550; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
  .chip.on { background: #fff; color: var(--dark); }
  .chip svg { width: 16px; height: 16px; }
  .eactions { display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; padding: 12px 14px calc(env(safe-area-inset-bottom) + 14px); }
  .eactions button { height: 52px; border-radius: 15px; font-weight: 650; font-size: 15px; }
  .eactions .sec { background: rgba(255,255,255,.12); color: #fff; }
  .eactions .pri { background: var(--blue); color: #fff; }

  /* Sheet */
  .veil { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: none; }
  .veil.on { display: block; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; background: var(--card); border-radius: 22px 22px 0 0; padding: 10px 20px calc(env(safe-area-inset-bottom) + 18px); transform: translateY(105%); transition: transform .28s cubic-bezier(.2,.8,.2,1); }
  .sheet.on { transform: none; }
  .grab { width: 38px; height: 5px; border-radius: 9px; background: var(--line); margin: 0 auto 16px; }
  .sheet h2 { font-size: 20px; font-weight: 700; letter-spacing: -.015em; }
  .sheet .sub { color: var(--ink2); font-size: 14px; margin-top: 4px; }
  .field { display: block; margin-top: 18px; }
  .field span { display: block; font-size: 13px; font-weight: 600; color: var(--ink2); margin-bottom: 6px; }
  .field input { width: 100%; height: 48px; border-radius: 13px; border: 0; background: var(--bg); color: var(--ink); padding: 0 14px; font-size: 16px; outline: none; box-shadow: 0 0 0 1px var(--line) inset; }
  .field input:focus { box-shadow: 0 0 0 2px var(--blue) inset; }
  .seg { display: grid; grid-template-columns: 1fr 1fr; background: var(--bg); border-radius: 13px; padding: 4px; box-shadow: 0 0 0 1px var(--line) inset; }
  .seg button { height: 40px; border-radius: 10px; font-size: 14px; font-weight: 600; color: var(--ink2); }
  .seg button.on { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .sheet .primary { margin-top: 22px; }
  .bar { height: 4px; border-radius: 9px; background: var(--line); overflow: hidden; margin-top: 14px; display: none; }
  .bar i { display: block; height: 100%; width: 0; background: var(--blue); transition: width .2s; }

  /* Done */
  #done { align-items: center; justify-content: center; text-align: center; padding: 32px; gap: 10px; }
  .tick { width: 72px; height: 72px; border-radius: 99px; background: var(--ok); color: #fff; display: grid; place-items: center; margin-bottom: 8px; }
  .tick svg { width: 34px; height: 34px; }
  #done p { color: var(--ink2); max-width: 300px; }
  #done .primary { max-width: 320px; margin-top: 18px; }
  input[type=file] { display: none; }
</style>
</head>
<body>

<section class="screen on" id="home">
  <div class="top">
    <div class="logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/></svg></div>
    <div class="brand">Atlas Scan</div>
    <div class="pill" id="conn"><span class="dot"></span><span id="connText">Connected</span></div>
  </div>
  <h1>Scan your pages</h1>
  <p class="lede">Atlas finds the edges, straightens each page and sends it to your computer as you go.</p>

  <button class="capture" id="shoot" type="button" aria-label="Take a photo of a page">
    <div class="frame"><i></i><i></i><i></i><i></i></div>
    <div class="shutter"><span></span></div>
    <b>Take a photo</b>
  </button>
  <div class="row2">
    <button class="soft" id="pick" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>From photos</button>
    <button class="soft" id="selfie" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10a8 8 0 0 0-14-5.3L4 7M4 14a8 8 0 0 0 14 5.3L20 17"/><path d="M4 3v4h4M20 21v-4h-4"/></svg>Front camera</button>
  </div>

  <div class="label"><span>Pages</span><span id="count"></span></div>
  <div class="grid" id="pages"></div>
  <div class="empty" id="empty">Your pages appear here.</div>
  <div class="err" id="err"></div>
</section>

<div class="dock" id="dock"><button class="primary ink" id="finish" type="button" disabled>Save in Atlas</button></div>

<section class="screen" id="edit">
  <div class="ebar">
    <button class="ghost" id="eBack" type="button">Retake</button>
    <div class="t" id="eTitle">Page 1</div>
    <button class="ghost" id="eDelete" type="button">Delete</button>
  </div>
  <div class="stage" id="stage">
    <img id="eImg" alt="">
    <svg id="eSvg"><polygon id="ePoly" fill="rgba(47,107,255,.14)" stroke="#2f6bff" stroke-width="2.5" stroke-linejoin="round"/></svg>
    <div class="busy" id="eBusy">Finding the page…</div>
  </div>
  <div class="tools" id="filters">
    <button class="chip" data-f="color" type="button">Colour</button>
    <button class="chip" data-f="gray" type="button">Greyscale</button>
    <button class="chip" data-f="bw" type="button">Black and white</button>
    <button class="chip" data-f="original" type="button">Original</button>
  </div>
  <div class="tools">
    <button class="chip" id="eRotate" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>Rotate</button>
    <button class="chip" id="eFull" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/></svg>Whole photo</button>
    <button class="chip" id="eAuto" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.8L20 10l-5 3.9L16.2 20 12 16.6 7.8 20 9 13.9 4 10l6.1-1.2z"/></svg>Find edges</button>
  </div>
  <div class="eactions">
    <button class="sec" id="eDone" type="button">Keep</button>
    <button class="pri" id="eNext" type="button">Keep, next page</button>
  </div>
</section>

<div class="veil" id="veil"></div>
<div class="sheet" id="sheet">
  <div class="grab"></div>
  <h2>Save in Atlas</h2>
  <p class="sub" id="sheetSub">Saved to your library, in the subject you chose on the computer.</p>
  <label class="field"><span>Name</span><input id="title" type="text" placeholder="e.g. Methods worksheet 4" autocomplete="off" enterkeyhint="done"></label>
  <div class="field"><span>Save as</span>
    <div class="seg"><button id="mPdf" class="on" type="button">One PDF</button><button id="mPhotos" type="button">A file per page</button></div>
  </div>
  <div class="bar" id="bar"><i></i></div>
  <button class="primary" id="save" type="button">Save</button>
</div>

<section class="screen" id="done">
  <div class="tick"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
  <h1 style="margin:0">Saved</h1>
  <p id="doneText">It is in your Atlas library.</p>
  <button class="primary ink" id="again" type="button">Scan something else</button>
</section>

<input id="fBack" type="file" accept="image/*" capture="environment">
<input id="fFront" type="file" accept="image/*" capture="user">
<input id="fPick" type="file" accept="image/*" multiple>

<script>
const kit = (${scanKit.toString()})()
;(() => {
  const $ = (id) => document.getElementById(id)
  const base = location.pathname.replace(/[/]$/, '')
  const batch = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const MAX_SIDE = 2400
  const pages = []      // { file, quad, filter, rotation, slot, state, thumb, upload }
  const queue = []      // photos waiting to be edited
  let slots = 0
  let editing = null    // the page open in the editor
  let isNew = false     // the open page has not been kept yet
  let lastFilter = 'color'
  let mode = 'pdf'
  let fitted = null     // { x, y, w, h } of the photo on screen

  const ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  const ICON_BAD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>'

  function show(id) { for (const s of document.querySelectorAll('.screen')) s.classList.toggle('on', s.id === id); $('dock').style.display = id === 'home' ? 'block' : 'none' }

  async function decode(file, max) {
    const bmp = await createImageBitmap(file)
    const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    if (bmp.close) bmp.close()
    return c
  }

  function fullQuad() { return [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]] }

  async function detect(file) {
    const c = await decode(file, 420)
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height)
    return kit.detectQuad(d.data, c.width, c.height)
  }

  // Straighten, rotate and filter one page into a JPEG.
  async function render(p, max) {
    const src = await decode(p.file, MAX_SIDE)
    const sd = src.getContext('2d').getImageData(0, 0, src.width, src.height)
    const quad = p.quad.map((q) => [q[0] * src.width, q[1] * src.height])
    const size = kit.pageSize(quad, max || MAX_SIDE)
    const px = kit.warp(sd.data, src.width, src.height, quad, size[0], size[1])
    kit.filter(px, size[0], size[1], p.filter)
    const flat = document.createElement('canvas')
    flat.width = size[0]; flat.height = size[1]
    flat.getContext('2d').putImageData(new ImageData(px, size[0], size[1]), 0, 0)
    const turn = p.rotation % 180 !== 0
    const out = document.createElement('canvas')
    out.width = turn ? size[1] : size[0]; out.height = turn ? size[0] : size[1]
    const x = out.getContext('2d')
    x.translate(out.width / 2, out.height / 2); x.rotate(p.rotation * Math.PI / 180)
    x.drawImage(flat, -size[0] / 2, -size[1] / 2)
    return new Promise((r) => out.toBlob(r, 'image/jpeg', 0.88))
  }

  function upload(p) {
    p.state = 'busy'; drawPages()
    p.upload = (async () => {
      const jpeg = await render(p)
      if (p.thumb) URL.revokeObjectURL(p.thumb)
      p.thumb = URL.createObjectURL(jpeg)
      drawPages()
      const r = await fetch(base + '/page?batch=' + batch + '&index=' + p.slot, { method: 'POST', body: jpeg })
      if (!r.ok) throw new Error(await r.text())
    })()
    p.upload.then(
      () => { p.state = 'ok'; setConn(true); drawPages() },
      (e) => { p.state = 'bad'; setConn(false); $('err').textContent = (e && e.message && e.message.length < 120 ? e.message : 'Could not reach your computer. Is Atlas still open on the same Wi-Fi?'); drawPages() },
    )
  }

  function setConn(ok) {
    $('conn').classList.toggle('off', !ok)
    $('connText').textContent = ok ? 'Connected' : 'Not connected'
  }

  function drawPages() {
    const box = $('pages'); box.innerHTML = ''
    pages.forEach((p, i) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'thumb'
      el.innerHTML = '<img alt=""><span class="n">' + (i + 1) + '</span>' +
        '<span class="s ' + (p.state === 'ok' ? 'ok' : p.state === 'bad' ? 'bad' : '') + '">' +
        (p.state === 'ok' ? ICON_OK : p.state === 'bad' ? ICON_BAD : '<span class="spin"></span>') + '</span>'
      if (p.thumb) el.querySelector('img').src = p.thumb
      el.onclick = () => openEditor(p, false)
      box.appendChild(el)
    })
    $('empty').style.display = pages.length ? 'none' : 'block'
    $('count').textContent = pages.length ? pages.length + (pages.length === 1 ? ' page' : ' pages') : ''
    $('finish').disabled = !pages.length
    $('finish').textContent = pages.length ? 'Save ' + pages.length + (pages.length === 1 ? ' page' : ' pages') + ' in Atlas' : 'Save in Atlas'
  }

  /* ---------- Editor ---------- */

  async function openEditor(p, fresh) {
    editing = p; isNew = fresh
    show('edit')
    $('eTitle').textContent = 'Page ' + (fresh ? pages.length + 1 : pages.indexOf(p) + 1)
    $('eBack').textContent = fresh ? 'Retake' : 'Cancel'
    $('eDelete').style.visibility = fresh ? 'hidden' : 'visible'
    $('eNext').textContent = fresh ? 'Keep, next page' : 'Save changes'
    $('eDone').textContent = fresh ? 'Keep' : 'Retake'
    setFilterChips(p.filter)
    rotLabel()
    $('eImg').style.visibility = 'hidden'; $('eSvg').style.visibility = 'hidden'
    $('eBusy').classList.add('on')
    const preview = await decode(p.file, 1400)
    if (editing !== p) return
    preview.toBlob((b) => {
      if (editing !== p) return
      const url = URL.createObjectURL(b)
      $('eImg').onload = () => { URL.revokeObjectURL(url); layout(preview.width, preview.height) }
      $('eImg').src = url
    }, 'image/jpeg', 0.9)
    if (!p.quad) p.quad = (await detect(p.file)) || fullQuad()
  }

  function layout(w, h) {
    const st = $('stage').getBoundingClientRect()
    const s = Math.min(st.width / w, st.height / h)
    fitted = { w: w * s, h: h * s, x: (st.width - w * s) / 2, y: (st.height - h * s) / 2 }
    for (const el of [$('eImg'), $('eSvg')]) {
      el.style.left = fitted.x + 'px'; el.style.top = fitted.y + 'px'
      el.style.width = fitted.w + 'px'; el.style.height = fitted.h + 'px'
    }
    $('eSvg').setAttribute('viewBox', '0 0 ' + fitted.w + ' ' + fitted.h)
    const wait = () => { if (!editing || !editing.quad) return setTimeout(wait, 50); drawQuad(); $('eBusy').classList.remove('on'); $('eImg').style.visibility = 'visible'; $('eSvg').style.visibility = 'visible' }
    wait()
  }

  function drawQuad() {
    const svg = $('eSvg')
    for (const h of svg.querySelectorAll('circle')) h.remove()
    const pts = editing.quad.map((q) => [q[0] * fitted.w, q[1] * fitted.h])
    $('ePoly').setAttribute('points', pts.map((p) => p.join(',')).join(' '))
    pts.forEach((pt, i) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      c.setAttribute('cx', pt[0]); c.setAttribute('cy', pt[1]); c.setAttribute('r', 15)
      c.setAttribute('class', 'handle'); c.dataset.i = i
      svg.appendChild(c)
    })
  }

  // Drag the nearest corner, anywhere on the stage (fingers are bigger than handles).
  let drag = -1
  $('stage').addEventListener('pointerdown', (e) => {
    if (!editing || !editing.quad || !fitted) return
    const st = $('stage').getBoundingClientRect()
    const x = e.clientX - st.left - fitted.x, y = e.clientY - st.top - fitted.y
    let best = -1, bestD = 60
    editing.quad.forEach((q, i) => { const d = Math.hypot(q[0] * fitted.w - x, q[1] * fitted.h - y); if (d < bestD) { bestD = d; best = i } })
    drag = best
    if (drag >= 0) $('stage').setPointerCapture(e.pointerId)
  })
  $('stage').addEventListener('pointermove', (e) => {
    if (drag < 0) return
    const st = $('stage').getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - st.left - fitted.x) / fitted.w))
    const y = Math.min(1, Math.max(0, (e.clientY - st.top - fitted.y) / fitted.h))
    editing.quad[drag] = [x, y]
    drawQuad()
  })
  const endDrag = () => { drag = -1 }
  $('stage').addEventListener('pointerup', endDrag)
  $('stage').addEventListener('pointercancel', endDrag)

  function setFilterChips(f) { for (const c of $('filters').children) c.classList.toggle('on', c.dataset.f === f) }
  for (const c of $('filters').children) c.onclick = () => { editing.filter = c.dataset.f; lastFilter = c.dataset.f; setFilterChips(c.dataset.f) }
  function rotLabel() { $('eRotate').lastChild.textContent = editing && editing.rotation ? 'Rotate · ' + editing.rotation + '°' : 'Rotate' }
  $('eRotate').onclick = () => { editing.rotation = (editing.rotation + 90) % 360; rotLabel() }
  $('eFull').onclick = () => { editing.quad = [[0, 0], [1, 0], [1, 1], [0, 1]]; drawQuad() }
  $('eAuto').onclick = async () => { editing.quad = (await detect(editing.file)) || fullQuad(); drawQuad() }

  function keep() {
    const p = editing
    if (isNew) { pages.push(p); p.slot = slots++ }
    editing = null
    upload(p)
    drawPages()
  }
  function next() {
    const p = queue.shift()
    if (p) openEditor(p, true)
    else show('home')
  }

  $('eNext').onclick = () => {
    const wasNew = isNew
    keep()
    if (wasNew && !queue.length) { $('fBack').click(); show('home') }
    else next()
  }
  $('eDone').onclick = () => {
    if (isNew) { keep(); next(); return }
    // Retake an existing page.
    retakeOf = editing; editing = null; show('home'); $('fBack').click()
  }
  $('eBack').onclick = () => {
    if (isNew) { editing = null; show('home'); $('fBack').click(); return }
    editing = null; show('home')
  }
  $('eDelete').onclick = () => {
    const p = editing; const i = pages.indexOf(p)
    if (i >= 0) pages.splice(i, 1)
    fetch(base + '/drop?batch=' + batch + '&index=' + p.slot, { method: 'POST' }).catch(() => {})
    editing = null; show('home'); drawPages()
  }

  /* ---------- Capture ---------- */

  let retakeOf = null
  function took(files) {
    const list = Array.from(files || [])
    if (!list.length) return
    if (retakeOf) {
      const p = retakeOf; retakeOf = null
      p.file = list[0]; p.quad = null
      openEditor(p, false)
      return
    }
    for (const f of list) queue.push({ file: f, quad: null, filter: lastFilter, rotation: 0, state: 'busy' })
    next()
  }
  $('shoot').onclick = () => $('fBack').click()
  $('selfie').onclick = () => $('fFront').click()
  $('pick').onclick = () => $('fPick').click()
  for (const id of ['fBack', 'fFront', 'fPick']) $(id).onchange = (e) => { took(e.target.files); e.target.value = '' }

  /* ---------- Save ---------- */

  function sheet(on) { $('veil').classList.toggle('on', on); $('sheet').classList.toggle('on', on) }
  $('finish').onclick = () => { $('err').textContent = ''; sheet(true) }
  $('veil').onclick = () => sheet(false)
  $('mPdf').onclick = () => { mode = 'pdf'; $('mPdf').className = 'on'; $('mPhotos').className = '' }
  $('mPhotos').onclick = () => { mode = 'photos'; $('mPhotos').className = 'on'; $('mPdf').className = '' }
  $('save').onclick = async () => {
    const bar = $('bar'), fill = bar.querySelector('i')
    $('save').disabled = true; bar.style.display = 'block'
    try {
      for (let i = 0; i < pages.length; i++) {
        $('save').textContent = 'Sending page ' + (i + 1) + ' of ' + pages.length + '…'
        const p = pages[i]
        try { await p.upload } catch { upload(p); await p.upload }
        fill.style.width = ((i + 1) / (pages.length + 1) * 100) + '%'
      }
      $('save').textContent = 'Saving…'
      const r = await fetch(base + '/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch, title: $('title').value, mode, order: pages.map((p) => p.slot) }) })
      if (!r.ok) throw new Error(await r.text())
      fill.style.width = '100%'
      sheet(false)
      $('doneText').textContent = pages.length + (pages.length === 1 ? ' page is' : ' pages are') + ' in your Atlas library.'
      show('done')
    } catch (e) {
      $('sheetSub').textContent = (e && e.message) || 'Could not save. Check Atlas is still open.'
      $('sheetSub').style.color = 'var(--bad)'
    }
    $('save').disabled = false; $('save').textContent = 'Save'; bar.style.display = 'none'; fill.style.width = '0'
  }
  $('again').onclick = () => location.reload()

  window.addEventListener('resize', () => { if (editing && $('eImg').naturalWidth) layout($('eImg').naturalWidth, $('eImg').naturalHeight) })
  drawPages()
})()
</script>
</body>
</html>`
