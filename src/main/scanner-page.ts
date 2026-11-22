/**
 * The scanner page the phone opens. One self-contained HTML file (no CDN, no tracking) so it
 * works on any phone browser without installing an app.
 *
 * Phones only allow live camera access on secure (https) pages, and a page on the home network
 * is plain http, so the main path uses the phone's own camera app (with its flash and front/back
 * switch). Where the browser does allow a live camera, a live mode adds auto-capture, a torch
 * button and camera flipping.
 */
export const SCANNER_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111214">
<title>Atlas scanner</title>
<style>
  :root { color-scheme: light dark; --bg:#f6f6f4; --card:#fff; --ink:#16181c; --ink2:#5d636d; --line:#e3e3df; --accent:#16181c; --accentFg:#fff; --blue:#2563eb; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111214; --card:#1b1d21; --ink:#f2f2f0; --ink2:#a1a6ae; --line:#2b2e33; --accent:#f2f2f0; --accentFg:#111214; } }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin:0; font: 16px/1.4 -apple-system, system-ui, sans-serif; background: var(--bg); color: var(--ink); padding: max(16px, env(safe-area-inset-top)) 16px calc(110px + env(safe-area-inset-bottom)); }
  h1 { font-size: 22px; margin: 4px 0 2px; letter-spacing: -0.02em; }
  p.sub { margin: 0 0 16px; color: var(--ink2); font-size: 14px; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px; margin-bottom: 12px; }
  label.f { display:block; font-size: 13px; color: var(--ink2); margin-bottom: 6px; }
  input[type=text] { width:100%; font: inherit; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
  .seg { display:flex; background: var(--bg); border-radius: 10px; padding: 3px; gap: 3px; margin-top: 10px; }
  .seg button { flex:1; border:0; background: transparent; color: var(--ink2); font: 600 14px system-ui; padding: 8px; border-radius: 8px; }
  .seg button.on { background: var(--card); color: var(--ink); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .big { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border:1px solid var(--line); background: var(--card); color: var(--ink); border-radius: 16px; padding: 18px 8px; font: 600 15px system-ui; }
  .big.main { grid-column: span 2; background: var(--accent); color: var(--accentFg); border-color: transparent; padding: 22px; font-size: 17px; }
  .big svg { width: 26px; height: 26px; }
  .row { display:flex; align-items:center; gap: 10px; font-size: 14px; color: var(--ink2); margin-top: 12px; }
  .pages { display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .pg { position:relative; border-radius: 10px; overflow:hidden; background: #000; aspect-ratio: 3/4; }
  .pg img { width:100%; height:100%; object-fit: cover; display:block; }
  .pg .st { position:absolute; left:6px; bottom:6px; background: rgba(0,0,0,.6); color:#fff; font: 600 11px system-ui; padding: 2px 7px; border-radius: 99px; }
  .pg .n { position:absolute; left:6px; top:6px; background: rgba(0,0,0,.6); color:#fff; font: 600 12px system-ui; padding: 2px 7px; border-radius: 99px; }
  .pg .tools { position:absolute; inset:auto 0 0 0; display:flex; justify-content: space-between; padding: 4px; background: linear-gradient(transparent, rgba(0,0,0,.65)); }
  .pg .tools button { border:0; background: rgba(255,255,255,.18); color:#fff; width: 30px; height: 30px; border-radius: 99px; font-size: 15px; }
  .bar { position: fixed; left:0; right:0; bottom:0; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(12px); border-top: 1px solid var(--line); }
  .send { width:100%; border:0; border-radius: 14px; padding: 16px; font: 700 17px system-ui; background: var(--blue); color:#fff; }
  .send:disabled { opacity: .4; }
  .progress { height: 4px; background: var(--line); border-radius: 99px; overflow: hidden; margin-bottom: 10px; display:none; }
  .progress i { display:block; height:100%; width:0; background: var(--blue); transition: width .2s; }
  .empty { text-align:center; color: var(--ink2); font-size: 14px; padding: 18px 0 6px; }
  .live { position: fixed; inset: 0; background: #000; z-index: 10; display:none; flex-direction: column; }
  .live video { flex:1; width:100%; object-fit: cover; }
  .live .ctl { display:flex; align-items:center; justify-content: space-around; padding: 18px 12px calc(24px + env(safe-area-inset-bottom)); }
  .live .ctl button { border:0; background: rgba(255,255,255,.16); color:#fff; border-radius: 99px; width: 52px; height: 52px; font: 600 12px system-ui; }
  .live .ctl .shoot { width: 76px; height: 76px; background:#fff; border: 5px solid rgba(255,255,255,.4); background-clip: padding-box; }
  .live .ctl .on { background: #facc15; color:#000; }
  .live .hint { position:absolute; top: calc(16px + env(safe-area-inset-top)); left:0; right:0; text-align:center; color:#fff; font: 600 14px system-ui; text-shadow: 0 1px 4px #000; }
  .live .flash { position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; transition: opacity .25s; }
  .done { text-align:center; padding: 40px 10px; display:none; }
  .done .tick { width: 72px; height: 72px; border-radius: 99px; background: #16a34a; color:#fff; display:grid; place-items:center; margin: 0 auto 14px; font-size: 38px; }
  .err { color: #dc2626; font-size: 14px; margin-top: 8px; min-height: 1em; }
  input[type=file] { display:none; }
  .switch { margin-left:auto; position:relative; width: 46px; height: 28px; }
  .switch input { opacity:0; width:0; height:0; }
  .switch span { position:absolute; inset:0; background: var(--line); border-radius: 99px; transition: .2s; }
  .switch span:before { content:''; position:absolute; width: 22px; height: 22px; left:3px; top:3px; background:#fff; border-radius:99px; transition:.2s; box-shadow: 0 1px 3px rgba(0,0,0,.3); }
  .switch input:checked + span { background: var(--blue); }
  .switch input:checked + span:before { transform: translateX(18px); }
</style>
</head>
<body>
<main id="app">
  <h1>Scan to Atlas</h1>
  <p class="sub">Pages go straight to your computer over your own Wi-Fi.</p>

  <div class="card">
    <label class="f" for="title">Name</label>
    <input id="title" type="text" placeholder="e.g. Chemistry worksheet 4" autocomplete="off">
    <div class="seg" role="tablist">
      <button id="mPdf" class="on" type="button">PDF (multi-page)</button>
      <button id="mPhotos" type="button">Separate photos</button>
    </div>
    <div class="row">Clean up as a document (black and white, sharper)
      <label class="switch"><input id="enhance" type="checkbox" checked><span></span></label>
    </div>
  </div>

  <div class="grid2" style="margin-bottom:12px">
    <button class="big main" id="shoot" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
      Take a photo of a page
    </button>
    <button class="big" id="live" type="button" hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/></svg>
      Auto scan
    </button>
    <button class="big" id="selfie" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10a8 8 0 0 0-14-5.3L4 7M4 14a8 8 0 0 0 14 5.3L20 17"/><path d="M4 3v4h4M20 21v-4h-4"/></svg>
      Front camera
    </button>
    <button class="big" id="pick" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>
      From photos
    </button>
  </div>
  <p class="sub" style="margin-top:-4px">Tip: your camera’s own flash and flip buttons work here. Fill the frame with the page.</p>

  <div class="card">
    <label class="f">Pages</label>
    <div class="pages" id="pages"></div>
    <div class="empty" id="empty">No pages yet. Take a photo to start.</div>
  </div>
  <div class="err" id="err"></div>
</main>

<section class="done" id="done">
  <div class="tick">✓</div>
  <h1 id="doneTitle">Sent to Atlas</h1>
  <p class="sub">It is in your library on your computer.</p>
  <button class="send" id="again" type="button" style="max-width:320px">Scan something else</button>
</section>

<div class="bar" id="bar">
  <div class="progress" id="prog"><i></i></div>
  <button class="send" id="send" type="button" disabled>Save in Atlas</button>
</div>

<div class="live" id="liveView">
  <video id="video" playsinline muted autoplay></video>
  <div class="hint" id="hint">Hold steady over the page. It captures by itself.</div>
  <div class="flash" id="flashFx"></div>
  <div class="ctl">
    <button id="lClose" type="button">Done</button>
    <button id="lTorch" type="button">Flash</button>
    <button id="lShoot" class="shoot" type="button" aria-label="Capture"></button>
    <button id="lAuto" class="on" type="button">Auto</button>
    <button id="lFlip" type="button">Flip</button>
  </div>
</div>

<input id="fBack" type="file" accept="image/*" capture="environment">
<input id="fFront" type="file" accept="image/*" capture="user">
<input id="fPick" type="file" accept="image/*" multiple>

<script>
(() => {
  const $ = (id) => document.getElementById(id)
  const base = location.pathname.replace(/\\/$/, '')
  const pages = []   // { blob, url, rotation, slot, upload }
  let slots = 0
  let mode = 'pdf'
  const batch = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

  function render() {
    const box = $('pages'); box.innerHTML = ''
    pages.forEach((p, i) => {
      const el = document.createElement('div'); el.className = 'pg'
      el.innerHTML = '<img alt=""><span class="n">' + (i + 1) + '</span><div class="tools"><button data-a="left" aria-label="Move earlier">‹</button><button data-a="rot" aria-label="Rotate">⟳</button><button data-a="del" aria-label="Remove">✕</button></div>'
      if (p.state) { const s = document.createElement('span'); s.className = 'st'; s.textContent = p.state; el.appendChild(s) }
      const img = el.querySelector('img'); img.src = p.url; img.style.transform = 'rotate(' + p.rotation + 'deg)'
      el.querySelectorAll('button').forEach((b) => b.onclick = () => {
        const a = b.dataset.a
        if (a === 'del') { URL.revokeObjectURL(p.url); pages.splice(i, 1); drop(p) }
        if (a === 'rot') { p.rotation = (p.rotation + 90) % 360; upload(p) }
        if (a === 'left' && i > 0) { pages.splice(i, 1); pages.splice(i - 1, 0, p) }
        render()
      })
      box.appendChild(el)
    })
    $('empty').style.display = pages.length ? 'none' : 'block'
    $('send').disabled = !pages.length
    $('send').textContent = pages.length ? 'Save ' + pages.length + ' page' + (pages.length === 1 ? '' : 's') + ' in Atlas' : 'Save in Atlas'
  }

  function add(blob) {
    if (pages.length >= 60) { $('err').textContent = 'That is the most pages for one scan (60).'; return }
    const p = { blob, url: URL.createObjectURL(blob), rotation: 0, slot: slots++ }
    pages.push(p); upload(p)
  }

  // Each photo goes to the computer as soon as it is taken (again if it is rotated).
  function upload(p) {
    p.state = 'Sending…'; render()
    p.upload = (async () => {
      const jpeg = await prepare(p)
      const r = await fetch(base + '/page?batch=' + batch + '&index=' + p.slot, { method: 'POST', body: jpeg })
      if (!r.ok) throw new Error(await r.text())
    })()
    p.upload.then(
      () => { p.state = '✓ On computer'; render() },
      (e) => { p.state = 'Not sent'; $('err').textContent = (e && e.message) || 'Could not reach the computer. Is Atlas still open?'; render() },
    )
  }

  function drop(p) {
    fetch(base + '/drop?batch=' + batch + '&index=' + p.slot, { method: 'POST' }).catch(() => {})
  }

  // Shrinks big photos, applies rotation and the optional document clean-up, returns a JPEG.
  async function prepare(p) {
    const bmp = await createImageBitmap(p.blob)
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height))
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
    const turn = p.rotation % 180 !== 0
    const c = document.createElement('canvas'); c.width = turn ? h : w; c.height = turn ? w : h
    const x = c.getContext('2d')
    x.translate(c.width / 2, c.height / 2); x.rotate(p.rotation * Math.PI / 180); x.drawImage(bmp, -w / 2, -h / 2, w, h)
    if ($('enhance').checked) {
      const d = x.getImageData(0, 0, c.width, c.height), a = d.data
      // Grey, then stretch contrast between the darkest and lightest 2%.
      const hist = new Uint32Array(256)
      for (let i = 0; i < a.length; i += 4) { const g = (a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114) | 0; a[i] = g; hist[g]++ }
      const n = a.length / 4; let lo = 0, hi = 255, acc = 0
      for (; lo < 255 && (acc += hist[lo]) < n * 0.02; lo++);
      acc = 0; for (; hi > 0 && (acc += hist[hi]) < n * 0.02; hi--);
      const span = Math.max(1, hi - lo)
      for (let i = 0; i < a.length; i += 4) { let v = ((a[i] - lo) / span) * 255; v = v > 200 ? 255 : v; a[i] = a[i + 1] = a[i + 2] = Math.max(0, Math.min(255, v)) }
      x.putImageData(d, 0, 0)
    }
    return new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85))
  }

  async function send() {
    $('err').textContent = ''; $('send').disabled = true
    const prog = $('prog'), bar = prog.querySelector('i'); prog.style.display = 'block'
    try {
      for (let i = 0; i < pages.length; i++) {
        $('send').textContent = 'Sending page ' + (i + 1) + ' of ' + pages.length + '…'
        const p = pages[i]
        try { await p.upload } catch { upload(p); await p.upload }
        bar.style.width = ((i + 1) / (pages.length + 1) * 100) + '%'
      }
      $('send').textContent = 'Saving…'
      const r = await fetch(base + '/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batch, title: $('title').value, mode, order: pages.map((p) => p.slot) }) })
      if (!r.ok) throw new Error(await r.text())
      bar.style.width = '100%'
      $('app').style.display = 'none'; $('bar').style.display = 'none'; $('done').style.display = 'block'
    } catch (e) {
      $('err').textContent = (e && e.message) || 'Could not send. Check the computer is on and Atlas is open.'
      $('send').disabled = false; render()
    }
    prog.style.display = 'none'; bar.style.width = '0'
  }

  $('mPdf').onclick = () => { mode = 'pdf'; $('mPdf').className = 'on'; $('mPhotos').className = '' }
  $('mPhotos').onclick = () => { mode = 'photos'; $('mPhotos').className = 'on'; $('mPdf').className = '' }
  $('shoot').onclick = () => $('fBack').click()
  $('selfie').onclick = () => $('fFront').click()
  $('pick').onclick = () => $('fPick').click()
  for (const id of ['fBack', 'fFront', 'fPick']) $(id).onchange = (e) => { for (const f of e.target.files) add(f); e.target.value = '' }
  $('send').onclick = send
  $('enhance').onchange = () => pages.forEach(upload)
  $('again').onclick = () => location.reload()

  /* ----- Live camera: only where the browser allows it (secure pages). ----- */
  const canLive = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  if (canLive) $('live').hidden = false
  let stream = null, facing = 'environment', auto = true, torch = false, loop = 0, still = 0, last = null, cooldown = 0
  async function openLive() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
      $('video').srcObject = stream; $('liveView').style.display = 'flex'; watch()
    } catch (e) { $('err').textContent = 'The live camera is not available here. Use “Take a photo” instead.' }
  }
  function closeLive() { cancelAnimationFrame(loop); stream && stream.getTracks().forEach((t) => t.stop()); stream = null; $('liveView').style.display = 'none' }
  function grab() {
    const v = $('video'); const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
    c.getContext('2d').drawImage(v, 0, 0)
    $('flashFx').style.opacity = 1; setTimeout(() => $('flashFx').style.opacity = 0, 120)
    navigator.vibrate && navigator.vibrate(30)
    c.toBlob((b) => b && add(b), 'image/jpeg', 0.92)
    cooldown = performance.now() + 2500; still = 0
    $('hint').textContent = 'Captured page ' + (pages.length + 1) + '. Turn the page.'
  }
  // Auto-capture: when the picture stops moving for about a second, take it.
  function watch() {
    const v = $('video'), c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true })
    c.width = 48; c.height = 36
    const tick = () => {
      if (v.videoWidth) {
        x.drawImage(v, 0, 0, 48, 36); const d = x.getImageData(0, 0, 48, 36).data
        if (last) {
          let diff = 0; for (let i = 0; i < d.length; i += 4) diff += Math.abs(d[i] - last[i])
          const moving = diff / (48 * 36) > 6
          if (auto && performance.now() > cooldown) { still = moving ? 0 : still + 1; if (still > 28) grab() }
          if (moving && performance.now() > cooldown) $('hint').textContent = 'Hold steady over the page. It captures by itself.'
        }
        last = d
      }
      loop = requestAnimationFrame(tick)
    }
    tick()
  }
  $('live').onclick = openLive
  $('lClose').onclick = closeLive
  $('lShoot').onclick = grab
  $('lAuto').onclick = () => { auto = !auto; $('lAuto').className = auto ? 'on' : '' }
  $('lFlip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; closeLive(); openLive() }
  $('lTorch').onclick = async () => {
    const track = stream && stream.getVideoTracks()[0]
    try { torch = !torch; await track.applyConstraints({ advanced: [{ torch }] }); $('lTorch').className = torch ? 'on' : '' }
    catch { $('hint').textContent = 'This camera has no flash control.' }
  }
  render()
})()
</script>
</body>
</html>`
