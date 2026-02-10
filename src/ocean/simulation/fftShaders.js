import { Vector2 } from 'three';

export const FFTShaders = {
  simulationVertex: {
    vertexShader: `
      varying vec2 vUV;

      void main() {
        vUV = position.xy * 0.5 + 0.5;
        gl_Position = vec4(position, 1.0);
      }
    `,
  },

  subtransform: {
    uniforms: {
      u_input: { value: null },
      u_transformSize: { value: 512.0 },
      u_subtransformSize: { value: 250.0 },
    },
    fragmentShader: `
      precision highp float;
      #include <common>

      uniform sampler2D u_input;
      uniform float u_transformSize;
      uniform float u_subtransformSize;

      varying vec2 vUV;

      vec2 multiplyComplex(vec2 a, vec2 b) {
        return vec2(a.x * b.x - a.y * b.y, a.y * b.x + a.x * b.y);
      }

      void main() {
        #ifdef HORIZONTAL
          float index = vUV.x * u_transformSize - 0.5;
        #else
          float index = vUV.y * u_transformSize - 0.5;
        #endif

        float evenIndex = floor(index / u_subtransformSize) * (u_subtransformSize * 0.5) + mod(index, u_subtransformSize * 0.5);

        #ifdef HORIZONTAL
          vec4 even = texture2D(u_input, vec2(evenIndex + 0.5, gl_FragCoord.y) / u_transformSize).rgba;
          vec4 odd = texture2D(u_input, vec2(evenIndex + u_transformSize * 0.5 + 0.5, gl_FragCoord.y) / u_transformSize).rgba;
        #else
          vec4 even = texture2D(u_input, vec2(gl_FragCoord.x, evenIndex + 0.5) / u_transformSize).rgba;
          vec4 odd = texture2D(u_input, vec2(gl_FragCoord.x, evenIndex + u_transformSize * 0.5 + 0.5) / u_transformSize).rgba;
        #endif

        float twiddleArgument = -2.0 * PI * (index / u_subtransformSize);
        vec2 twiddle = vec2(cos(twiddleArgument), sin(twiddleArgument));

        vec2 outputA = even.xy + multiplyComplex(twiddle, odd.xy);
        vec2 outputB = even.zw + multiplyComplex(twiddle, odd.zw);

        gl_FragColor = vec4(outputA, outputB);
      }
    `,
  },

  initialSpectrum: {
    uniforms: {
      u_wind: { value: new Vector2(10.0, 10.0) },
      u_resolution: { value: 512.0 },
      u_size: { value: 1000.0 },
    },
    vertexShader: `
      void main() {
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      #include <common>

      const float G = 9.81;
      const float KM = 370.0;
      const float CM = 0.23;

      uniform vec2 u_wind;
      uniform float u_resolution;
      uniform float u_size;

      float omega(float k) {
        return sqrt(G * k * (1.0 + pow2(k / KM)));
      }

      #if __VERSION__ == 100
      float tanh(float x) {
        return (1.0 - exp(-2.0 * x)) / (1.0 + exp(-2.0 * x));
      }
      #endif

      void main() {
        vec2 coordinates = gl_FragCoord.xy - 0.5;

        float n = (coordinates.x < u_resolution * 0.5) ? coordinates.x : coordinates.x - u_resolution;
        float m = (coordinates.y < u_resolution * 0.5) ? coordinates.y : coordinates.y - u_resolution;

        vec2 K = (2.0 * PI * vec2(n, m)) / u_size;
        float k = length(K);

        float l_wind = max(length(u_wind), 0.001);

        float Omega = 0.84;
        float kp = G * pow2(Omega / l_wind);

        float c = omega(k) / max(k, 0.0001);
        float cp = omega(kp) / max(kp, 0.0001);

        float Lpm = exp(-1.25 * pow2(kp / max(k, 0.0001)));
        float gamma = 1.7;
        float sigma = 0.08 * (1.0 + 4.0 * pow(Omega, -3.0));
        float Gamma = exp(-pow2(sqrt(k / max(kp, 0.0001)) - 1.0) / (2.0 * pow2(sigma)));
        float Jp = pow(gamma, Gamma);
        float Fp = Lpm * Jp * exp(-Omega / sqrt(10.0) * (sqrt(k / max(kp, 0.0001)) - 1.0));
        float alphap = 0.006 * sqrt(Omega);
        float Bl = 0.5 * alphap * cp / max(c, 0.0001) * Fp;

        float z0 = 0.000037 * pow2(l_wind) / G * pow(l_wind / max(cp, 0.0001), 0.9);
        float uStar = 0.41 * l_wind / max(log(10.0 / z0), 0.0001);
        float alpham = 0.01 * ((uStar < CM) ? (1.0 + log(max(uStar / CM, 0.0001))) : (1.0 + 3.0 * log(max(uStar / CM, 0.0001))));
        float Fm = exp(-0.25 * pow2(k / KM - 1.0));
        float Bh = 0.5 * alpham * CM / max(c, 0.0001) * Fm * Lpm;

        float a0 = log(2.0) / 4.0;
        float am = 0.13 * uStar / CM;
        float Delta = tanh(a0 + 4.0 * pow(c / max(cp, 0.0001), 2.5) + am * pow(CM / max(c, 0.0001), 2.5));

        float cosPhi = dot(normalize(u_wind), normalize(K + vec2(0.0001)));

        float S = (1.0 / (2.0 * PI)) * pow(max(k, 0.0001), -4.0) * (Bl + Bh) * (1.0 + Delta * (2.0 * cosPhi * cosPhi - 1.0));

        float dk = 2.0 * PI / u_size;
        float h = sqrt(max(S, 0.0) / 2.0) * dk;

        if (K.x == 0.0 && K.y == 0.0) {
          h = 0.0;
        }

        gl_FragColor = vec4(h, 0.0, 0.0, 0.0);
      }
    `,
  },

  phase: {
    uniforms: {
      u_phases: { value: null },
      u_deltaTime: { value: null },
      u_resolution: { value: null },
      u_size: { value: null },
    },
    fragmentShader: `
      precision highp float;
      #include <common>

      const float G = 9.81;
      const float KM = 370.0;

      varying vec2 vUV;

      uniform sampler2D u_phases;
      uniform float u_deltaTime;
      uniform float u_resolution;
      uniform float u_size;

      float omega(float k) {
        return sqrt(G * k * (1.0 + k * k / (KM * KM)));
      }

      void main() {
        vec2 coordinates = gl_FragCoord.xy - 0.5;
        float n = (coordinates.x < u_resolution * 0.5) ? coordinates.x : coordinates.x - u_resolution;
        float m = (coordinates.y < u_resolution * 0.5) ? coordinates.y : coordinates.y - u_resolution;
        vec2 waveVector = (2.0 * PI * vec2(n, m)) / u_size;

        float phase = texture2D(u_phases, vUV).r;
        float deltaPhase = omega(length(waveVector)) * u_deltaTime;
        phase = mod(phase + deltaPhase, 2.0 * PI);

        gl_FragColor = vec4(phase, 0.0, 0.0, 0.0);
      }
    `,
  },

  spectrum: {
    uniforms: {
      u_size: { value: null },
      u_resolution: { value: null },
      u_choppiness: { value: null },
      u_phases: { value: null },
      u_initialSpectrum: { value: null },
    },
    fragmentShader: `
      precision highp float;
      #include <common>

      varying vec2 vUV;

      uniform float u_size;
      uniform float u_resolution;
      uniform float u_choppiness;
      uniform sampler2D u_phases;
      uniform sampler2D u_initialSpectrum;

      vec2 multiplyComplex(vec2 a, vec2 b) {
        return vec2(a.x * b.x - a.y * b.y, a.y * b.x + a.x * b.y);
      }

      vec2 multiplyByI(vec2 z) {
        return vec2(-z.y, z.x);
      }

      void main() {
        vec2 coordinates = gl_FragCoord.xy - 0.5;
        float n = (coordinates.x < u_resolution * 0.5) ? coordinates.x : coordinates.x - u_resolution;
        float m = (coordinates.y < u_resolution * 0.5) ? coordinates.y : coordinates.y - u_resolution;
        vec2 waveVector = (2.0 * PI * vec2(n, m)) / u_size;

        float phase = texture2D(u_phases, vUV).r;
        vec2 phaseVector = vec2(cos(phase), sin(phase));

        vec2 h0 = texture2D(u_initialSpectrum, vUV).rg;
        vec2 h0Star = texture2D(u_initialSpectrum, vec2(1.0 - vUV + (1.0 / u_resolution))).rg;
        h0Star.y *= -1.0;

        vec2 h = multiplyComplex(h0, phaseVector) + multiplyComplex(h0Star, vec2(phaseVector.x, -phaseVector.y));

        float waveLength = max(length(waveVector), 0.0001);
        vec2 hX = -multiplyByI(h * (waveVector.x / waveLength)) * u_choppiness;
        vec2 hZ = -multiplyByI(h * (waveVector.y / waveLength)) * u_choppiness;

        if (waveVector.x == 0.0 && waveVector.y == 0.0) {
          h = vec2(0.0);
          hX = vec2(0.0);
          hZ = vec2(0.0);
        }

        gl_FragColor = vec4(hX + multiplyByI(h), hZ);
      }
    `,
  },

  normal: {
    uniforms: {
      u_displacementMap: { value: null },
      u_resolution: { value: null },
      u_size: { value: null },
    },
    fragmentShader: `
      precision highp float;

      varying vec2 vUV;

      uniform sampler2D u_displacementMap;
      uniform float u_resolution;
      uniform float u_size;

      void main() {
        float texel = 1.0 / u_resolution;
        float texelSize = u_size / u_resolution;

        vec3 center = texture2D(u_displacementMap, vUV).rgb;
        vec3 right = vec3(texelSize, 0.0, 0.0) + texture2D(u_displacementMap, vUV + vec2(texel, 0.0)).rgb - center;
        vec3 left = vec3(-texelSize, 0.0, 0.0) + texture2D(u_displacementMap, vUV + vec2(-texel, 0.0)).rgb - center;
        vec3 top = vec3(0.0, 0.0, -texelSize) + texture2D(u_displacementMap, vUV + vec2(0.0, -texel)).rgb - center;
        vec3 bottom = vec3(0.0, 0.0, texelSize) + texture2D(u_displacementMap, vUV + vec2(0.0, texel)).rgb - center;

        vec3 topRight = cross(right, top);
        vec3 topLeft = cross(top, left);
        vec3 bottomLeft = cross(left, bottom);
        vec3 bottomRight = cross(bottom, right);

        gl_FragColor = vec4(normalize(topRight + topLeft + bottomLeft + bottomRight), 1.0);
      }
    `,
  },
};
