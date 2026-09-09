/* Research prototype: client-side upscaling of the yifan.tv player through a
   WebGL2 canvas overlay (AMD FidelityFX Super Resolution 1.0, EASU + RCAS).
   Injected by scripts/research-upscale.mjs; not part of the shipped extension.
   Shader ports: MIT, based on GPUOpen FidelityFX-FSR and Hajime-san/web-fsr. */
(() => {
  "use strict";
  if (window.__yifanUpscale) return window.__yifanUpscale;
  const VERT = `#version 300 es
    void main() {
      vec2 p = vec2((gl_VertexID & 1) * 4 - 1, (gl_VertexID & 2) * 2 - 1);
      gl_Position = vec4(p, 0.0, 1.0);
    }`;
  const EASU = `#version 300 es
    precision highp float;
    uniform sampler2D uSource;
    uniform vec2 uInputSize;
    uniform vec2 uOutputSize;
    out vec4 fragColor;
    vec3 load(vec2 p) { return texture(uSource, p).rgb; }
    void tap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
      vec2 v = vec2(dot(off, dir), dot(off, vec2(-dir.y, dir.x)));
      v *= len;
      float d2 = min(dot(v, v), clp);
      float wB = 0.4 * d2 - 1.0;
      float wA = lob * d2 - 1.0;
      wB *= wB; wA *= wA;
      wB = 1.5625 * wB - 0.5625;
      float w = wB * wA;
      aC += c * w; aW += w;
    }
    void set(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
      float lenX = max(abs(lD - lC), abs(lC - lB));
      float dirX = lD - lB;
      dir.x += dirX * w;
      lenX = clamp(abs(dirX) / lenX, 0.0, 1.0);
      lenX *= lenX;
      len += lenX * w;
      float lenY = max(abs(lE - lC), abs(lC - lA));
      float dirY = lE - lA;
      dir.y += dirY * w;
      lenY = clamp(abs(dirY) / lenY, 0.0, 1.0);
      lenY *= lenY;
      len += lenY * w;
    }
    void main() {
      vec2 ip = floor(gl_FragCoord.xy);
      vec4 con0 = vec4(uInputSize / uOutputSize, 0.5 * uInputSize / uOutputSize - 0.5);
      vec4 con1 = vec4(1, 1, 1, -1) / uInputSize.xyxy;
      vec4 con2 = vec4(-1, 2, 1, 2) / uInputSize.xyxy;
      vec4 con3 = vec4(0, 4, 0, 0) / uInputSize.xyxy;
      vec2 pp = ip * con0.xy + con0.zw;
      vec2 fp = floor(pp);
      pp -= fp;
      vec2 p0 = fp * con1.xy + con1.zw;
      vec2 p1 = p0 + con2.xy;
      vec2 p2 = p0 + con2.zw;
      vec2 p3 = p0 + con3.xy;
      vec4 off = vec4(-0.5, 0.5, -0.5, 0.5) * con1.xxyy;
      vec3 bC = load(p0 + off.xw); float bL = bC.g + 0.5 * (bC.r + bC.b);
      vec3 cC = load(p0 + off.yw); float cL = cC.g + 0.5 * (cC.r + cC.b);
      vec3 iC = load(p1 + off.xw); float iL = iC.g + 0.5 * (iC.r + iC.b);
      vec3 jC = load(p1 + off.yw); float jL = jC.g + 0.5 * (jC.r + jC.b);
      vec3 fC = load(p1 + off.yz); float fL = fC.g + 0.5 * (fC.r + fC.b);
      vec3 eC = load(p1 + off.xz); float eL = eC.g + 0.5 * (eC.r + eC.b);
      vec3 kC = load(p2 + off.xw); float kL = kC.g + 0.5 * (kC.r + kC.b);
      vec3 lC = load(p2 + off.yw); float lL = lC.g + 0.5 * (lC.r + lC.b);
      vec3 hC = load(p2 + off.yz); float hL = hC.g + 0.5 * (hC.r + hC.b);
      vec3 gC = load(p2 + off.xz); float gL = gC.g + 0.5 * (gC.r + gC.b);
      vec3 oC = load(p3 + off.yz); float oL = oC.g + 0.5 * (oC.r + oC.b);
      vec3 nC = load(p3 + off.xz); float nL = nC.g + 0.5 * (nC.r + nC.b);
      vec2 dir = vec2(0.0);
      float len = 0.0;
      set(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
      set(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
      set(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
      set(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
      vec2 dir2 = dir * dir;
      float dirR = dir2.x + dir2.y;
      bool zro = dirR < (1.0 / 32768.0);
      dirR = inversesqrt(dirR);
      dirR = zro ? 1.0 : dirR;
      dir.x = zro ? 1.0 : dir.x;
      dir *= vec2(dirR);
      len = len * 0.5;
      len *= len;
      float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
      vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
      float lob = 0.5 - 0.29 * len;
      float clp = 1.0 / lob;
      vec3 min4 = min(min(fC, gC), min(jC, kC));
      vec3 max4 = max(max(fC, gC), max(jC, kC));
      vec3 aC = vec3(0.0);
      float aW = 0.0;
      tap(aC, aW, vec2( 0.0,-1.0) - pp, dir, len2, lob, clp, bC);
      tap(aC, aW, vec2( 1.0,-1.0) - pp, dir, len2, lob, clp, cC);
      tap(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, iC);
      tap(aC, aW, vec2( 0.0, 1.0) - pp, dir, len2, lob, clp, jC);
      tap(aC, aW, vec2( 0.0, 0.0) - pp, dir, len2, lob, clp, fC);
      tap(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, eC);
      tap(aC, aW, vec2( 1.0, 1.0) - pp, dir, len2, lob, clp, kC);
      tap(aC, aW, vec2( 2.0, 1.0) - pp, dir, len2, lob, clp, lC);
      tap(aC, aW, vec2( 2.0, 0.0) - pp, dir, len2, lob, clp, hC);
      tap(aC, aW, vec2( 1.0, 0.0) - pp, dir, len2, lob, clp, gC);
      tap(aC, aW, vec2( 1.0, 2.0) - pp, dir, len2, lob, clp, oC);
      tap(aC, aW, vec2( 0.0, 2.0) - pp, dir, len2, lob, clp, nC);
      fragColor = vec4(min(max4, max(min4, aC / aW)), 1.0);
    }`;
  const RCAS = `#version 300 es
    precision highp float;
    uniform sampler2D uSource;
    uniform float uSharpness; // stops; 0 = maximum
    out vec4 fragColor;
    vec3 load(ivec2 p) {
      ivec2 size = textureSize(uSource, 0);
      return texelFetch(uSource, clamp(p, ivec2(0), size - 1), 0).rgb;
    }
    void main() {
      ivec2 sp = ivec2(gl_FragCoord.xy);
      vec3 b = load(sp + ivec2( 0,-1));
      vec3 d = load(sp + ivec2(-1, 0));
      vec3 e = load(sp);
      vec3 f = load(sp + ivec2( 1, 0));
      vec3 h = load(sp + ivec2( 0, 1));
      float bL = b.g + 0.5 * (b.b + b.r);
      float dL = d.g + 0.5 * (d.b + d.r);
      float eL = e.g + 0.5 * (e.b + e.r);
      float fL = f.g + 0.5 * (f.b + f.r);
      float hL = h.g + 0.5 * (h.b + h.r);
      float nz = 0.25 * (bL + dL + fL + hL) - eL;
      nz = clamp(abs(nz) / (max(max(bL, dL), max(eL, max(fL, hL))) - min(min(bL, dL), min(eL, min(fL, hL)))), 0.0, 1.0);
      nz = 1.0 - 0.5 * nz;
      vec3 mn4 = min(b, min(f, h));
      vec3 mx4 = max(b, max(f, h));
      vec2 peakC = vec2(1.0, -4.0);
      vec3 hitMin = mn4 / (4.0 * mx4);
      vec3 hitMax = (peakC.x - mx4) / (4.0 * mn4 + peakC.y);
      vec3 lobeRGB = max(-hitMin, hitMax);
      float lobe = max(-(0.25 - 1.0 / 16.0), min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * exp2(-uSharpness);
      lobe *= nz;
      fragColor = vec4((lobe * (b + d + h + f) + e) / (4.0 * lobe + 1.0), 1.0);
    }`;

  const video = document.querySelector("#video_player");
  const player = video?.closest("vg-player");
  if (!video || !player) throw new Error("Player not found");
  const canvas = document.createElement("canvas");
  canvas.id = "yifan-upscale-canvas";
  canvas.style.cssText = "position:absolute;pointer-events:none;z-index:1;background:#000;";
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
  if (!gl) throw new Error("WebGL2 unavailable");
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const timer = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  function program(fragment) {
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const easu = program(EASU), rcas = program(RCAS);
  const uniforms = {
    easuSource: gl.getUniformLocation(easu, "uSource"), input: gl.getUniformLocation(easu, "uInputSize"), output: gl.getUniformLocation(easu, "uOutputSize"),
    rcasSource: gl.getUniformLocation(rcas, "uSource"), sharpness: gl.getUniformLocation(rcas, "uSharpness")
  };
  const texture = (w, h) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  };
  const sourceTexture = texture();
  let intermediate = null;
  const framebuffer = gl.createFramebuffer();
  gl.bindVertexArray(gl.createVertexArray());

  const state = { targetWidth: 1920, maxHeight: 1080, sharpness: 0.2, running: false, handle: 0, frames: 0, jsTime: 0, gpuTime: 0, gpuSamples: 0, presented: 0, startedAt: 0, queries: [], lastFrame: null };
  function outputSize() {
    const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
    let width = state.targetWidth, height = Math.round(width * vh / vw);
    if (height > state.maxHeight) { height = state.maxHeight; width = Math.round(height * vw / vh); }
    return { width: width & ~1, height: height & ~1 };
  }
  function layout() {
    // Match the video's object-fit: contain box so letterboxing stays identical.
    const W = video.offsetWidth, H = video.offsetHeight, vw = video.videoWidth, vh = video.videoHeight;
    if (!W || !H || !vw || !vh) return;
    const scale = Math.min(W / vw, H / vh);
    const cw = vw * scale, ch = vh * scale;
    canvas.style.left = `${video.offsetLeft + (W - cw) / 2}px`;
    canvas.style.top = `${video.offsetTop + (H - ch) / 2}px`;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    const { width, height } = outputSize();
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height;
      if (intermediate) gl.deleteTexture(intermediate);
      intermediate = texture(width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, intermediate, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }
  function draw() {
    const started = performance.now();
    let query = null;
    if (timer) { query = gl.createQuery(); gl.beginQuery(timer.TIME_ELAPSED_EXT, query); }
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, video);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(easu);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sourceTexture);
    gl.uniform1i(uniforms.easuSource, 0);
    gl.uniform2f(uniforms.input, video.videoWidth, video.videoHeight);
    gl.uniform2f(uniforms.output, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(rcas);
    gl.bindTexture(gl.TEXTURE_2D, intermediate);
    gl.uniform1i(uniforms.rcasSource, 0);
    gl.uniform1f(uniforms.sharpness, state.sharpness);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); state.queries.push(query); }
    for (const q of state.queries.splice(0, state.queries.length)) {
      if (gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE) && !gl.getParameter(timer.GPU_DISJOINT_EXT)) {
        state.gpuTime += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6; state.gpuSamples += 1; gl.deleteQuery(q);
      } else state.queries.push(q);
    }
    state.jsTime += performance.now() - started;
    state.frames += 1;
  }
  function tick(_now, metadata) {
    if (!state.running) return;
    try { layout(); if (video.readyState >= 2) draw(); state.lastFrame = metadata?.presentedFrames ?? null; }
    catch (error) { state.error = error.message; }
    state.handle = video.requestVideoFrameCallback(tick);
  }
  const observer = new ResizeObserver(() => layout());
  const api = {
    canvas,
    start({ width = 1920, maxHeight = 1080, sharpness = 0.2 } = {}) {
      Object.assign(state, { targetWidth: width, maxHeight, sharpness });
      if (getComputedStyle(player).position === "static") player.style.position = "relative";
      if (!canvas.isConnected) video.insertAdjacentElement("afterend", canvas);
      canvas.hidden = false;
      layout();
      observer.observe(player);
      video.addEventListener("resize", layout);
      api.resetStats();
      if (!state.running) { state.running = true; state.handle = video.requestVideoFrameCallback(tick); }
      return api.stats();
    },
    render() { layout(); if (video.readyState >= 2) draw(); },
    show(visible) { canvas.style.visibility = visible ? "visible" : "hidden"; },
    setResolution(width, maxHeight) { state.targetWidth = width; state.maxHeight = maxHeight; layout(); api.resetStats(); return outputSize(); },
    stop() { state.running = false; video.cancelVideoFrameCallback(state.handle); canvas.hidden = true; observer.disconnect(); },
    resetStats() { Object.assign(state, { frames: 0, jsTime: 0, gpuTime: 0, gpuSamples: 0, startedAt: performance.now(), presented: state.lastFrame ?? 0, error: null }); },
    stats() {
      const seconds = (performance.now() - state.startedAt) / 1000;
      const quality = video.getVideoPlaybackQuality?.();
      const rect = canvas.getBoundingClientRect();
      return {
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
        source: { width: video.videoWidth, height: video.videoHeight },
        output: { width: canvas.width, height: canvas.height },
        displayed: { cssWidth: Math.round(rect.width), cssHeight: Math.round(rect.height), devicePixelWidth: Math.round(rect.width * devicePixelRatio) },
        seconds: Number(seconds.toFixed(2)), renderedFrames: state.frames,
        renderedFps: Number((state.frames / seconds).toFixed(1)),
        presentedVideoFrames: state.lastFrame != null ? state.lastFrame - state.presented : null,
        droppedVideoFrames: quality?.droppedVideoFrames ?? null, totalVideoFrames: quality?.totalVideoFrames ?? null,
        jsMsPerFrame: state.frames ? Number((state.jsTime / state.frames).toFixed(2)) : null,
        gpuMsPerFrame: state.gpuSamples ? Number((state.gpuTime / state.gpuSamples).toFixed(2)) : null,
        error: state.error || null, contextLost: gl.isContextLost()
      };
    },
    async pip() {
      // Element PiP only accepts <video>; feed the upscaled canvas through captureStream.
      if (!api.pipVideo) {
        const v = document.createElement("video");
        v.muted = true; v.playsInline = true; v.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;";
        v.srcObject = canvas.captureStream();
        document.body.append(v);
        api.pipVideo = v;
        await v.play();
        await new Promise(resolve => v.readyState >= 1 ? resolve() : v.addEventListener("loadedmetadata", resolve, { once: true }));
      }
      const win = await api.pipVideo.requestPictureInPicture();
      return { width: win.width, height: win.height, element: document.pictureInPictureElement === api.pipVideo };
    },
    async exitPip() { if (document.pictureInPictureElement) await document.exitPictureInPicture(); },
    async documentPip() {
      // Document PiP can host the canvas element itself; move it and move it back on close.
      const win = await window.documentPictureInPicture.requestWindow({ width: 960, height: Math.round(960 * canvas.height / canvas.width) });
      win.document.body.style.cssText = "margin:0;background:#000;display:grid;place-items:center;height:100vh;";
      const framesBefore = state.frames;
      const placeholder = document.createComment("upscale-canvas");
      canvas.replaceWith(placeholder);
      canvas.style.cssText = "width:100%;height:auto;";
      win.document.body.append(canvas);
      await new Promise(resolve => setTimeout(resolve, 1500));
      const result = { framesWhileDetached: state.frames - framesBefore, innerWidth: win.innerWidth, innerHeight: win.innerHeight, contextLost: gl.isContextLost() };
      canvas.style.cssText = "position:absolute;pointer-events:none;z-index:1;background:#000;";
      placeholder.replaceWith(canvas);
      layout();
      win.close();
      return result;
    }
  };
  window.__yifanUpscale = api;
  return api;
})();
