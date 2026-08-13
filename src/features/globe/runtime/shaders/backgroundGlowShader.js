import * as THREE from "three";

export function createBackgroundGlowMaterial({
  centerColor,
  outerColor,
  opacity = 0.1,
  crimsonMix = 0.3,
  falloffStart = 0.2,
  falloffEnd = 0.94,
  falloffPower = 2.2
} = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      centerColor: { value: centerColor },
      outerColor: { value: outerColor },
      opacity: { value: opacity },
      crimsonMix: { value: crimsonMix },
      falloffStart: { value: falloffStart },
      falloffEnd: { value: falloffEnd },
      falloffPower: { value: falloffPower }
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 centerColor;
      uniform vec3 outerColor;
      uniform float opacity;
      uniform float crimsonMix;
      uniform float falloffStart;
      uniform float falloffEnd;
      uniform float falloffPower;
      varying vec2 vUv;
      void main() {
        vec2 centeredUv = vUv - vec2(0.5);
        float radius = length(centeredUv) * 2.0;
        float core = 1.0 - smoothstep(0.0, falloffEnd * 0.72, radius);
        float falloff = 1.0 - smoothstep(falloffStart, falloffEnd, radius);
        float alpha = pow(max(falloff, 0.0), falloffPower) * opacity;
        vec3 color = mix(outerColor, centerColor, core * crimsonMix);
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

export function createEnvironmentBackgroundTexture(config) {
  const gradient = config.background.gradient;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  const centerBrightness = THREE.MathUtils.clamp(gradient.centerBrightness, 0, 1);
  const edgeBrightness = THREE.MathUtils.clamp(gradient.edgeBrightness, 0, 1);
  const vignetteStrength = THREE.MathUtils.clamp(gradient.vignetteStrength, 0, 1);
  const center = Math.round(255 * centerBrightness);
  const mid = Math.round(24 + 48 * centerBrightness);
  const edge = Math.round(255 * edgeBrightness);
  const vignetteAlpha = 0.18 + vignetteStrength * 0.72;
  const base = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  base.addColorStop(0, `rgb(${Math.round(edge * 0.32)}, ${Math.round(edge * 0.46)}, ${Math.round(edge * 0.72)})`);
  base.addColorStop(0.56, `rgb(${Math.round(mid * 0.72)}, ${Math.round(mid * 0.78)}, ${mid})`);
  base.addColorStop(1, `rgb(${edge}, ${edge}, ${Math.round(edge * 1.05)})`);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const environment = ctx.createRadialGradient(
    canvas.width * 0.52,
    canvas.height * 0.46,
    canvas.width * 0.04,
    canvas.width * 0.52,
    canvas.height * 0.46,
    canvas.width * 0.72
  );
  environment.addColorStop(0, `rgba(${center}, ${center}, ${Math.round(center * 1.12)}, 0.34)`);
  environment.addColorStop(0.34, `rgba(${Math.round(mid * 0.82)}, ${mid}, ${Math.round(mid * 1.28)}, 0.2)`);
  environment.addColorStop(0.72, "rgba(8, 13, 22, 0)");
  ctx.fillStyle = environment;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const vignette = ctx.createRadialGradient(
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.2,
    canvas.width * 0.5,
    canvas.height * 0.5,
    canvas.width * 0.78
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, `rgba(0, 0, 0, ${vignetteAlpha})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
