/* GPU upscaling for the yifan.tv player. Runs in the page's main world.
   AMD FidelityFX Super Resolution 1.0 (EASU + RCAS) ported to WebGL2, so it
   runs through ANGLE on NVIDIA, AMD, Intel, and Apple GPUs alike. No remote
   code, no network requests, and no change to the site's stream or player. */
(() => {
  "use strict";
  const marker = Symbol.for("yifan-ad-skipper.upscale");
  if (window[marker]) return;
  window[marker] = true;

  const PRESETS = { "1080p": { width: 1920, maxHeight: 1080 }, "2k": { width: 2560, maxHeight: 1440 } };
  const SHARPNESS = 0.2; // RCAS stops; 0 is maximum sharpening.
  const VERT = `#version 300 es
    void main() {
      vec2 p = vec2((gl_VertexID & 1) * 4 - 1, (gl_VertexID & 2) * 2 - 1);
      gl_Position = vec4(p, 0.0, 1.0);
    }`;
  // Divisions that the reference shader leaves to hardware rcp() are guarded
  // with epsilons: NaN handling differs between GPU vendors and would show as
  // black pixels in flat or saturated areas.
  const EASU = `#version 300 es
    precision highp float;
    uniform sampler2D uSource;
    uniform vec2 uInputSize;
    uniform vec2 uOutputSize;
    out vec4 fragColor;
    vec3 load(vec2 p) { return texture(uSource, p).rgb; }
    void tap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len, float lob, float clp, vec3 c) {
      vec2 v = vec2(dot(off, dir), dot(off, vec2(-dir.y, dir.x))) * len;
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
      lenX = clamp(abs(dirX) / max(lenX, 1e-5), 0.0, 1.0);
      len += lenX * lenX * w;
      float lenY = max(abs(lE - lC), abs(lC - lA));
      float dirY = lE - lA;
      dir.y += dirY * w;
      lenY = clamp(abs(dirY) / max(lenY, 1e-5), 0.0, 1.0);
      len += lenY * lenY * w;
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
      float dirR = dot(dir, dir);
      bool zro = dirR < (1.0 / 32768.0);
      dirR = zro ? 1.0 : inversesqrt(dirR);
      dir.x = zro ? 1.0 : dir.x;
      dir *= vec2(dirR);
      len = len * 0.5;
      len *= len;
      float stretch = dot(dir, dir) / max(max(abs(dir.x), abs(dir.y)), 1e-5);
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
      vec3 pix = aW == 0.0 ? fC : aC / aW;
      fragColor = vec4(clamp(min(max4, max(min4, pix)), 0.0, 1.0), 1.0);
    }`;
  const RCAS = `#version 300 es
    precision highp float;
    uniform sampler2D uSource;
    uniform float uSharpness;
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
      float range = max(max(bL, dL), max(eL, max(fL, hL))) - min(min(bL, dL), min(eL, min(fL, hL)));
      float nz = 0.25 * (bL + dL + fL + hL) - eL;
      nz = 1.0 - 0.5 * clamp(abs(nz) / max(range, 1e-5), 0.0, 1.0);
      vec3 mn4 = min(b, min(f, h));
      vec3 mx4 = max(b, max(f, h));
      vec3 hitMin = mn4 / max(4.0 * mx4, vec3(1e-5));
      vec3 hitMax = (1.0 - mx4) / min(4.0 * mn4 - 4.0, vec3(-1e-5));
      vec3 lobeRGB = max(-hitMin, hitMax);
      float lobe = max(-(0.25 - 1.0 / 16.0), min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * exp2(-uSharpness) * nz;
      fragColor = vec4(clamp((lobe * (b + d + h + f) + e) / (4.0 * lobe + 1.0), 0.0, 1.0), 1.0);
    }`;

  let mode = "off";
  let overlay = null;
  let status = { state: "idle" };
  let reportPending = false;
  function report(next) {
    if (next) status = next;
    if (reportPending) return;
    reportPending = true;
    queueMicrotask(() => {
      reportPending = false;
      window.postMessage({ source: "yifan-ad-skipper:page", type: "upscale-status", mode, ...status }, location.origin);
    });
  }
  function describeRenderer(gl) {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const raw = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    return raw.replace(/^ANGLE \((.*)\)$/, "$1").replace(/, Unspecified Version|,? Direct3D11 vs_\S+ ps_\S+|, OpenGL \d[\d.]*/g, "").slice(0, 120);
  }

  class Overlay {
    constructor(video, preset) {
      this.video = video;
      this.player = video.closest("vg-player") || video.parentElement;
      this.preset = preset;
      this.frames = 0;
      this.windowStart = performance.now();
      this.fps = 0;
      this.drawn = false;
      this.destroyed = false;
      this.canvas = document.createElement("canvas");
      this.canvas.id = "yifan-upscale-canvas";
      this.canvas.style.cssText = "position:absolute;pointer-events:none;z-index:1;background:#000;visibility:hidden;";
      const gl = this.canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: "high-performance" });
      if (!gl) throw Object.assign(new Error("WebGL2 is unavailable"), { unsupported: true });
      this.gl = gl;
      this.renderer = describeRenderer(gl);
      this.easu = this.program(EASU);
      this.rcas = this.program(RCAS);
      this.uniforms = {
        easuSource: gl.getUniformLocation(this.easu, "uSource"), input: gl.getUniformLocation(this.easu, "uInputSize"), output: gl.getUniformLocation(this.easu, "uOutputSize"),
        rcasSource: gl.getUniformLocation(this.rcas, "uSource"), sharpness: gl.getUniformLocation(this.rcas, "uSharpness")
      };
      this.source = this.texture();
      this.intermediate = null;
      this.framebuffer = gl.createFramebuffer();
      gl.bindVertexArray(gl.createVertexArray());
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      this.onLost = event => { event.preventDefault(); this.fail("The GPU context was lost", true); };
      this.canvas.addEventListener("webglcontextlost", this.onLost);
      this.layout = this.layout.bind(this);
      this.tick = this.tick.bind(this);
      this.onEmptied = () => { this.drawn = false; this.canvas.style.visibility = "hidden"; };
      this.video.addEventListener("resize", this.layout);
      this.video.addEventListener("emptied", this.onEmptied);
      this.video.addEventListener("loadstart", this.onEmptied);
      document.addEventListener("fullscreenchange", this.layout);
      this.observer = new ResizeObserver(this.layout);
      this.observer.observe(this.player);
      if (getComputedStyle(this.player).position === "static") this.player.style.position = "relative";
      this.video.insertAdjacentElement("afterend", this.canvas);
      this.installPip();
      this.layout();
      this.handle = this.video.requestVideoFrameCallback(this.tick);
      this.timer = setInterval(() => this.publish(), 1000);
      this.publish();
    }
    program(fragment) {
      const gl = this.gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader: ${gl.getShaderInfoLog(shader)}`);
        return shader;
      };
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(program)}`);
      return program;
    }
    texture(width, height) {
      const gl = this.gl;
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (width) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return texture;
    }
    outputSize() {
      const vw = this.video.videoWidth || 16, vh = this.video.videoHeight || 9;
      let width = this.preset.width, height = Math.round(width * vh / vw);
      if (height > this.preset.maxHeight) { height = this.preset.maxHeight; width = Math.round(height * vw / vh); }
      return { width: Math.max(2, width & ~1), height: Math.max(2, height & ~1) };
    }
    layout() {
      if (this.destroyed) return;
      const video = this.video, canvas = this.canvas;
      const W = video.offsetWidth, H = video.offsetHeight, vw = video.videoWidth, vh = video.videoHeight;
      if (!W || !H || !vw || !vh) return;
      // Match the video's object-fit: contain box so letterboxing is unchanged.
      const scale = Math.min(W / vw, H / vh);
      const cw = vw * scale, ch = vh * scale;
      canvas.style.left = `${video.offsetLeft + (W - cw) / 2}px`;
      canvas.style.top = `${video.offsetTop + (H - ch) / 2}px`;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const { width, height } = this.outputSize();
      if (canvas.width !== width || canvas.height !== height) {
        const gl = this.gl;
        canvas.width = width; canvas.height = height;
        if (this.intermediate) gl.deleteTexture(this.intermediate);
        this.intermediate = this.texture(width, height);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.intermediate, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        if (this.drawn) this.draw();
      }
    }
    draw() {
      const gl = this.gl, video = this.video, canvas = this.canvas;
      if (video.readyState < 2 || !video.videoWidth || !this.intermediate) return;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.source);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(this.easu);
      gl.uniform1i(this.uniforms.easuSource, 0);
      gl.uniform2f(this.uniforms.input, video.videoWidth, video.videoHeight);
      gl.uniform2f(this.uniforms.output, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(this.rcas);
      gl.bindTexture(gl.TEXTURE_2D, this.intermediate);
      gl.uniform1i(this.uniforms.rcasSource, 0);
      gl.uniform1f(this.uniforms.sharpness, SHARPNESS);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!this.drawn) { this.drawn = true; canvas.style.visibility = "visible"; this.publish(); }
      this.frames += 1;
    }
    tick() {
      if (this.destroyed) return;
      try { this.layout(); this.draw(); }
      catch (error) { this.fail(error.message); return; }
      this.handle = this.video.requestVideoFrameCallback(this.tick);
    }
    publish() {
      if (this.destroyed) return;
      const now = performance.now();
      const elapsed = (now - this.windowStart) / 1000;
      if (elapsed >= 1) { this.fps = Math.round(this.frames / elapsed); this.frames = 0; this.windowStart = now; }
      report({
        state: this.drawn ? "active" : "waiting", renderer: this.renderer,
        input: { width: this.video.videoWidth, height: this.video.videoHeight },
        output: { width: this.canvas.width, height: this.canvas.height },
        fps: this.fps, pip: document.pictureInPictureElement === this.pipVideo && !!this.pipVideo
      });
    }
    setPreset(preset) { this.preset = preset; this.layout(); this.publish(); }
    installPip() {
      // Element PiP accepts only <video>; feed the canvas to a hidden one. The
      // site's own PiP requests on its video are redirected while active.
      const button = document.createElement("button");
      button.type = "button";
      button.className = "yifan-upscale-pip";
      button.textContent = "PiP";
      button.title = "Picture in picture (upscaled)";
      button.setAttribute("aria-label", "Picture in picture, upscaled");
      button.addEventListener("click", event => { event.stopPropagation(); this.togglePip().catch(error => report({ ...status, pipError: error.name })); });
      this.button = button;
      this.player.append(button);
      this.originalPip = Object.prototype.hasOwnProperty.call(this.video, "requestPictureInPicture") ? this.video.requestPictureInPicture : null;
      this.video.requestPictureInPicture = () => this.enterPip();
    }
    async enterPip() {
      if (!this.pipVideo) {
        const pipVideo = document.createElement("video");
        pipVideo.muted = true; pipVideo.playsInline = true; pipVideo.className = "yifan-upscale-pip-video";
        pipVideo.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;";
        pipVideo.srcObject = this.canvas.captureStream();
        pipVideo.addEventListener("leavepictureinpicture", () => this.releasePip());
        this.player.append(pipVideo);
        this.pipVideo = pipVideo;
        await pipVideo.play();
        if (pipVideo.readyState < 1) await new Promise(resolve => pipVideo.addEventListener("loadedmetadata", resolve, { once: true }));
      }
      const win = await this.pipVideo.requestPictureInPicture();
      this.publish();
      return win;
    }
    releasePip() {
      const pipVideo = this.pipVideo;
      if (!pipVideo) return;
      this.pipVideo = null;
      for (const track of pipVideo.srcObject?.getTracks() || []) track.stop();
      pipVideo.srcObject = null;
      pipVideo.remove();
      this.publish();
    }
    async togglePip() {
      if (this.pipVideo && document.pictureInPictureElement === this.pipVideo) await document.exitPictureInPicture();
      else await this.enterPip();
    }
    fail(message, retry) {
      const wasDestroyed = this.destroyed;
      this.destroy();
      if (!wasDestroyed) report({ state: "error", error: message });
      if (retry) scheduleAttach(1500);
    }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      clearInterval(this.timer);
      this.video.cancelVideoFrameCallback?.(this.handle);
      this.observer.disconnect();
      this.video.removeEventListener("resize", this.layout);
      this.video.removeEventListener("emptied", this.onEmptied);
      this.video.removeEventListener("loadstart", this.onEmptied);
      document.removeEventListener("fullscreenchange", this.layout);
      if (this.originalPip) this.video.requestPictureInPicture = this.originalPip; else delete this.video.requestPictureInPicture;
      if (this.pipVideo && document.pictureInPictureElement === this.pipVideo) document.exitPictureInPicture().catch(() => {});
      this.releasePip();
      this.button?.remove();
      this.canvas.removeEventListener("webglcontextlost", this.onLost);
      this.canvas.remove();
      this.gl.getExtension("WEBGL_lose_context")?.loseContext();
      if (overlay === this) overlay = null;
    }
  }

  let attachTimer = 0;
  function scheduleAttach(delay = 0) {
    if (attachTimer) return;
    attachTimer = setTimeout(() => { attachTimer = 0; sync(); }, delay);
  }
  function sync() {
    const preset = PRESETS[mode];
    const video = document.getElementById("video_player");
    const usable = video instanceof HTMLVideoElement && video.isConnected && typeof video.requestVideoFrameCallback === "function";
    if (overlay && (!preset || overlay.video !== video || !usable)) overlay.destroy();
    if (!preset) { report({ state: "idle" }); return; }
    if (!usable) { report({ state: video ? "unsupported" : "idle", error: video ? "This player cannot supply frames" : undefined }); return; }
    if (overlay) { if (overlay.preset !== preset) overlay.setPreset(preset); return; }
    try { overlay = new Overlay(video, preset); }
    catch (error) { report({ state: error.unsupported ? "unsupported" : "error", error: error.message }); }
  }
  const style = document.createElement("style");
  style.id = "yifan-upscale-style";
  style.textContent = `
    .yifan-upscale-pip { position: absolute; right: 16px; top: 14px; z-index: 2147483000; padding: 5px 10px; border: 0; border-radius: 6px;
      background: rgba(0, 0, 0, .6); color: #fff; font: 600 12px/1.4 system-ui, sans-serif; cursor: pointer; transition: opacity .2s; }
    .yifan-upscale-pip:hover { background: rgba(0, 0, 0, .85); }
    vg-player.controls-hidden .yifan-upscale-pip { opacity: 0; pointer-events: none; }
  `;
  const mutations = new MutationObserver(() => {
    const video = document.getElementById("video_player");
    if ((overlay ? overlay.video !== video : mode !== "off" && video)) scheduleAttach();
    if (!style.isConnected && document.head) document.head.append(style);
  });
  mutations.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "yifan-ad-skipper:content" || event.data.type !== "configure") return;
    if (typeof event.data.upscale === "string" && (event.data.upscale === "off" || PRESETS[event.data.upscale])) {
      if (event.data.upscale !== mode) { mode = event.data.upscale; sync(); }
    }
    report();
  });
  report();
})();
