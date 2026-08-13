import * as THREE from "three";

export function createAtmosphereMaterial(config, { outerLayer = false } = {}) {
  const shell = outerLayer ? config.atmosphere.outer : config.atmosphere.inner;
  return new THREE.ShaderMaterial({
    uniforms: {
      crimsonColor: { value: new THREE.Color(config.colors.accent) },
      graphiteColor: { value: new THREE.Color(config.colors.graphiteAtmosphere) },
      opacity: { value: shell.opacity },
      crimsonIntensity: { value: shell.crimsonIntensity },
      graphiteIntensity: { value: shell.graphiteIntensity },
      fresnelPower: { value: shell.fresnelPower },
      horizonFalloff: { value: shell.horizonFalloff }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 crimsonColor;
      uniform vec3 graphiteColor;
      uniform float opacity;
      uniform float crimsonIntensity;
      uniform float graphiteIntensity;
      uniform float fresnelPower;
      uniform float horizonFalloff;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        float viewDot = abs(dot(normalize(vNormalView), normalize(vViewPosition)));
        float fresnel = pow(1.0 - viewDot, fresnelPower);
        float horizon = smoothstep(0.0, max(horizonFalloff, 0.001), fresnel);
        vec3 color = graphiteColor * graphiteIntensity + crimsonColor * crimsonIntensity;
        float alpha = opacity * horizon;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

export function createCrimsonRimMaterial(config) {
  const rim = config.crimsonRim;
  return new THREE.ShaderMaterial({
    uniforms: {
      rimColor: { value: new THREE.Color(config.colors.accent) },
      rimStrength: { value: rim.rimStrength },
      rimOpacity: { value: rim.rimOpacity },
      rimWidth: { value: rim.rimWidth },
      rimFeather: { value: rim.rimFeather },
      rimSaturation: { value: rim.rimSaturation }
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    vertexShader: `
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 rimColor;
      uniform float rimStrength;
      uniform float rimOpacity;
      uniform float rimWidth;
      uniform float rimFeather;
      uniform float rimSaturation;
      varying vec3 vNormalView;
      varying vec3 vViewPosition;
      void main() {
        float viewDot = abs(dot(normalize(vNormalView), normalize(vViewPosition)));
        float rim = 1.0 - smoothstep(max(0.0, 1.0 - rimWidth), 1.0, viewDot);
        rim = pow(max(rim, 0.0), max(rimFeather, 0.001)) * rimStrength;
        vec3 desaturated = vec3(dot(rimColor, vec3(0.299, 0.587, 0.114)));
        vec3 color = mix(desaturated, rimColor, rimSaturation);
        float alpha = rim * rimOpacity;
        if (alpha < 0.001) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}
