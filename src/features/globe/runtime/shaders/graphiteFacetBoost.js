import * as THREE from "three";

export function applyGraphiteFacetBoost(material, {
  strength = 0.03,
  rimStrength = 0.05,
  rimPower = 1.8
} = {}) {
  material.userData.graphiteFacetBoost = {
    strength,
    rimStrength,
    rimPower,
    uniforms: null
  };
  material.onBeforeCompile = (shader) => {
    const boost = material.userData.graphiteFacetBoost;
    shader.uniforms.facetBoostColor = { value: new THREE.Color("#68686d") };
    shader.uniforms.facetBoostStrength = { value: boost.strength };
    shader.uniforms.facetRimStrength = { value: boost.rimStrength };
    shader.uniforms.facetRimPower = { value: boost.rimPower };
    boost.uniforms = shader.uniforms;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      uniform vec3 facetBoostColor;
      uniform float facetBoostStrength;
      uniform float facetRimStrength;
      uniform float facetRimPower;`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `float facetView = abs(dot(normalize(normal), normalize(-vViewPosition)));
      float facetRim = pow(1.0 - facetView, facetRimPower);
      float facetPlane = pow(1.0 - max(facetView, 0.0), 0.72);
      outgoingLight += facetBoostColor * (facetPlane * facetBoostStrength + facetRim * facetRimStrength);
      #include <opaque_fragment>`
    );
  };
  material.customProgramCacheKey = () => "graphite-facet-boost-runtime-tunable";
}

export function setGraphiteFacetBoost(material, strength) {
  const boost = material?.userData.graphiteFacetBoost;
  if (!boost) return;
  boost.strength = strength;
  if (boost.uniforms) boost.uniforms.facetBoostStrength.value = strength;
}
