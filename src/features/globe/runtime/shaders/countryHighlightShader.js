import * as THREE from "three";

export function sphericalShaderBody() {
  return `
    uniform float longitudeOffset;
    uniform float latitudeOffset;
    uniform float longitudeSign;
    uniform float flipU;
    uniform float flipV;

    float wrap01(float value) {
      return fract(value);
    }

    float wrapPi(float value) {
      return mod(value + 3.14159265359, 6.28318530718) - 3.14159265359;
    }

    vec2 sphericalUv(vec3 localPosition) {
      vec3 p = normalize(localPosition);
      float lon = wrapPi(longitudeSign * (atan(p.z, p.x) - 1.57079632679) + longitudeOffset);
      float lat = clamp(asin(clamp(p.y, -1.0, 1.0)) + latitudeOffset, -1.57079632679, 1.57079632679);
      float u = wrap01((lon + 3.14159265359) / 6.28318530718);
      float v = clamp(1.0 - (lat + 1.57079632679) / 3.14159265359, 0.0, 1.0);
      if (flipU > 0.5) u = 1.0 - u;
      if (flipV > 0.5) v = 1.0 - v;
      return vec2(wrap01(u), clamp(v, 0.0, 1.0));
    }
  `;
}

export function alignmentUniforms(config) {
  const alignment = config.alignment;
  return {
    longitudeOffset: { value: THREE.MathUtils.degToRad(alignment.longitudeOffsetDeg) },
    latitudeOffset: { value: THREE.MathUtils.degToRad(alignment.latitudeOffsetDeg) },
    longitudeSign: { value: alignment.longitudeSign },
    flipU: { value: alignment.flipU ? 1 : 0 },
    flipV: { value: alignment.flipV ? 1 : 0 }
  };
}

export function createDebugAtlasMaterial(texture, config) {
  return new THREE.ShaderMaterial({
    uniforms: {
      idMap: { value: texture },
      opacity: { value: 0.86 },
      ...alignmentUniforms(config)
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vLocalPosition;
      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D idMap;
      uniform float opacity;
      varying vec3 vLocalPosition;
      ${sphericalShaderBody()}
      void main() {
        vec2 uv = sphericalUv(vLocalPosition);
        vec3 idColor = texture2D(idMap, uv).rgb;
        gl_FragColor = vec4(idColor, opacity);
      }
    `
  });
}

export function createHighlightMaterial(idTexture, config, visualTexture = idTexture) {
  const maskTexture = config.selection?.highlightMaskSource === "id" ? idTexture : visualTexture;
  const maskImage = maskTexture?.image;
  const maskWidth = Number(maskImage?.naturalWidth ?? maskImage?.videoWidth ?? maskImage?.width) || 4096;
  const maskHeight = Number(maskImage?.naturalHeight ?? maskImage?.videoHeight ?? maskImage?.height) || 2048;

  return new THREE.ShaderMaterial({
    uniforms: {
      idMap: { value: idTexture },
      visualMap: { value: visualTexture },
      enabled: { value: 0 },
      selected: { value: 0 },
      opacity: { value: 0 },
      edgeBoost: { value: 0 },
      pulseProgress: { value: 1 },
      breatheCycleSeconds: { value: config.selection.breatheSeconds },
      activityIntensity: { value: 0.25 },
      time: { value: 0 },
      texelSize: { value: new THREE.Vector2(1 / maskWidth, 1 / maskHeight) },
      targetRgb: { value: new THREE.Vector3(0, 0, 0) },
      highlightColor: { value: new THREE.Color(config.colors.accent) },
      useIdAtlasMask: { value: config.selection?.highlightMaskSource === "id" ? 1 : 0 },
      ...alignmentUniforms(config)
    },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    vertexShader: `
      varying vec3 vLocalPosition;
      void main() {
        vLocalPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D idMap;
      uniform sampler2D visualMap;
      uniform float enabled;
      uniform float selected;
      uniform float opacity;
      uniform float edgeBoost;
      uniform float pulseProgress;
      uniform float breatheCycleSeconds;
      uniform float activityIntensity;
      uniform float time;
      uniform vec2 texelSize;
      uniform vec3 targetRgb;
      uniform vec3 highlightColor;
      uniform float useIdAtlasMask;
      varying vec3 vLocalPosition;
      ${sphericalShaderBody()}
      void main() {
        if (enabled < 0.5 || opacity <= 0.001) discard;
        vec2 uv = sphericalUv(vLocalPosition);
        vec3 idColor = texture2D(idMap, uv).rgb;
        float idMatch = 1.0 - step(0.01, distance(idColor, targetRgb));
        vec3 visualColor = texture2D(visualMap, uv).rgb;
        float visualMatch = 1.0 - smoothstep(0.01, 0.035, distance(visualColor, targetRgb));
        float maskMatch = mix(visualMatch, idMatch, useIdAtlasMask);
        if (maskMatch <= 0.001) discard;
        vec3 nColor = mix(texture2D(visualMap, uv + vec2(0.0, texelSize.y)).rgb, texture2D(idMap, uv + vec2(0.0, texelSize.y)).rgb, useIdAtlasMask);
        vec3 sColor = mix(texture2D(visualMap, uv - vec2(0.0, texelSize.y)).rgb, texture2D(idMap, uv - vec2(0.0, texelSize.y)).rgb, useIdAtlasMask);
        vec3 eColor = mix(texture2D(visualMap, uv + vec2(texelSize.x, 0.0)).rgb, texture2D(idMap, uv + vec2(texelSize.x, 0.0)).rgb, useIdAtlasMask);
        vec3 wColor = mix(texture2D(visualMap, uv - vec2(texelSize.x, 0.0)).rgb, texture2D(idMap, uv - vec2(texelSize.x, 0.0)).rgb, useIdAtlasMask);
        float n = distance(nColor, targetRgb);
        float s = distance(sColor, targetRgb);
        float e = distance(eColor, targetRgb);
        float w = distance(wColor, targetRgb);
        float edge = maskMatch * step(0.01, max(max(n, s), max(e, w)));
        vec3 n2Color = mix(texture2D(visualMap, uv + vec2(0.0, texelSize.y * 2.0)).rgb, texture2D(idMap, uv + vec2(0.0, texelSize.y * 2.0)).rgb, useIdAtlasMask);
        vec3 s2Color = mix(texture2D(visualMap, uv - vec2(0.0, texelSize.y * 2.0)).rgb, texture2D(idMap, uv - vec2(0.0, texelSize.y * 2.0)).rgb, useIdAtlasMask);
        vec3 e2Color = mix(texture2D(visualMap, uv + vec2(texelSize.x * 2.0, 0.0)).rgb, texture2D(idMap, uv + vec2(texelSize.x * 2.0, 0.0)).rgb, useIdAtlasMask);
        vec3 w2Color = mix(texture2D(visualMap, uv - vec2(texelSize.x * 2.0, 0.0)).rgb, texture2D(idMap, uv - vec2(texelSize.x * 2.0, 0.0)).rgb, useIdAtlasMask);
        float n2 = distance(n2Color, targetRgb);
        float s2 = distance(s2Color, targetRgb);
        float e2 = distance(e2Color, targetRgb);
        float w2 = distance(w2Color, targetRgb);
        float wideEdge = maskMatch * step(0.01, max(max(n2, s2), max(e2, w2)));
        float breathePhase = time * 6.28318530718 / max(breatheCycleSeconds, 0.001);
        float breathe = mix(1.0, 0.96 + 0.08 * (0.5 + 0.5 * sin(breathePhase)), selected);
        float pulseWave = pulseProgress < 1.0
          ? pow(sin(clamp(pulseProgress, 0.0, 1.0) * 3.14159265359), 0.82) * (1.0 - pulseProgress * 0.18)
          : 0.0;
        float fillAlpha = mix(0.16, 0.28, selected) * mix(0.75, 1.0, activityIntensity);
        float edgeAlpha = edge * mix(0.16, 0.34, selected) * (breathe + edgeBoost + pulseWave * 0.82);
        float pulseHalo = wideEdge * pulseWave * selected * 0.085;
        float shapedFill = fillAlpha * maskMatch;
        gl_FragColor = vec4(highlightColor, (shapedFill + edgeAlpha + pulseHalo) * opacity);
      }
    `
  });
}
