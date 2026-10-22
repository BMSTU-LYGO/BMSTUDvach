<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { Mesh, ShaderMaterial } from 'three'
import {
  SCENE_PRIORITY,
  useThreeScene,
  type ThreeBuildResult,
  type ThreeContext,
} from '@/composables/useThreeScene'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)

const pointer = ref({ x: 0, y: 0 })
const networkCore: NetworkCoreController | null = null

function onPointerMove(e: PointerEvent) {
  if (!containerRef.value) return
  const rect = containerRef.value.getBoundingClientRect()
  pointer.value.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
  pointer.value.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  networkCore?.setPointer(pointer.value.x, pointer.value.y)
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('pointermove', onPointerMove)
})

interface NetworkCoreController {
  setPointer(x: number, y: number): void
  dispose(): void
}

/* --- the palette of the hero (docs/ART_DIRECTION.md — «ink and amber») --- */

/** The body of the core: warm ink — a dark mass on a warm sheet. */
const INK = 0x2a2620
/** The lit side of the body: the same ink, one step towards the paper. */
const INK_LIT = 0x4b4438
/** The rim of the core and the bodies on the orbit: amber. */
const AMBER = 0xd4882a
/** The cool steel of a body that is not inked. */
const STEEL = 0x5a6480

/**
 * A deterministic value of an index — the hero must look the same on every
 * reload, otherwise the visual regression has nothing to compare.
 */
function unitOf(index: number, salt: string): number {
  let h = 2166136261
  const key = `${index}:${salt}`
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000000) / 1000000
}

function build(ctx: ThreeContext): ThreeBuildResult {
  const { three, scene, camera } = ctx
  const { quality } = ctx

  const tracked: { dispose: () => void }[] = []
  const keep = <T extends { dispose: () => void }>(x: T): T => {
    tracked.push(x)
    return x
  }

  camera.position.set(0, 0, 12)

  const world = new three.Group()
  /**
   * The core stands above the middle of the screen.
   *
   * The hero of the page is a column of words: the kicker, the counters and
   * the button. The core used to stand right behind them — the words were
   * read on top of a milky ball. It stands above them now: the picture and
   * the text keep to their own half of the screen.
   */
  const CORE_LIFT = 2.5
  world.position.y = CORE_LIFT
  scene.add(world)

  const pointer = { x: 0, y: 0 }
  const smoothPointer = { x: 0, y: 0 }
  let elapsed = 0

  /**
   * The shell of a body: the same displacement for the surface and for the
   * cage around it, so the cage always hugs the surface it belongs to.
   */
  const SHELL_VERTEX = /* glsl */ `
    uniform float uTime;
    uniform float uHover;
    varying vec3 vNormal;
    varying float vNoise;

    float hash(vec3 p) {
      p = fract(p * 0.3183099 + 0.1);
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      return mix(
        mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
            mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
        mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
            mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z
      );
    }

    void main() {
      // The normal of a shell is the direction of its own position — the
      // surface and the cage around it then share one skin, even though the
      // cage carries no normals of its own.
      vec3 n = normalize(position);
      vNormal = normalize(normalMatrix * n);

      // The surface of the core is a skin of ink, not a stain: the noise
      // moves the shell a little, it never bleaches it.
      float noiseValue = noise(position * 2.0 + uTime * 0.18);
      noiseValue = noiseValue * 0.5 + 0.5;
      vNoise = noiseValue;

      float lift = noiseValue * 0.12 * (1.0 + uHover * 0.4);
      vec3 pos = position + n * lift;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `

  /**
   * The body of a shell: ink first, light second.
   *
   * The body is a dark mass, the lit side is the same ink one step towards
   * the paper, and the only light of the object is the thin amber rim of its
   * edge. On a warm sheet that reads as a silhouette — the thing used to be
   * a milky stain with no edge at all.
   */
  const SHELL_FRAGMENT = /* glsl */ `
    uniform vec3 uBody;
    uniform vec3 uLit;
    uniform vec3 uRim;
    uniform float uTime;
    uniform float uHover;
    uniform float uRimPower;
    uniform float uRimStrength;
    varying vec3 vNormal;
    varying float vNoise;

    void main() {
      vec3 lightDir = normalize(vec3(0.45, 0.78, 0.62));
      float diffuse = max(dot(vNormal, lightDir), 0.0);

      // The lit side of the ink: the same mass, one step towards the paper.
      vec3 color = mix(uBody, uLit, diffuse * diffuse * 0.85);

      // The rim: a thin amber edge — the only light of the object.
      float rim = pow(1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0), uRimPower);
      color += uRim * rim * uRimStrength * (0.85 + 0.15 * sin(uTime * 0.9));

      // The grain of the surface: a texture of the ink, never a wash.
      color *= 0.9 + vNoise * 0.2;

      // The hover warms the body a little — a lamp moves closer.
      color = mix(color, color + uRim * 0.18, uHover);

      gl_FragColor = vec4(color, 1.0);
    }
  `

  /** The cage around the core: the same shell, drawn as lines. */
  const CAGE_FRAGMENT = /* glsl */ `
    uniform vec3 uRim;
    uniform float uOpacity;
    varying vec3 vNormal;
    varying float vNoise;

    void main() {
      gl_FragColor = vec4(uRim, uOpacity * (0.55 + vNoise * 0.45));
    }
  `

  const coreMat = keep(
    new three.ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: SHELL_FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uHover: { value: 0 },
        uBody: { value: new three.Color(INK) },
        uLit: { value: new three.Color(INK_LIT) },
        uRim: { value: new three.Color(AMBER) },
        uRimPower: { value: 3.2 },
        uRimStrength: { value: 0.95 },
      },
    }),
  )
  const coreGeo = keep(new three.IcosahedronGeometry(1.4, quality === 'high' ? 4 : 3))
  const coreMesh = new three.Mesh(coreGeo, coreMat)
  world.add(coreMesh)

  // The cage around the core: the same shell, so it hugs the surface it
  // belongs to instead of floating inside it.
  const coreWireMat = keep(
    new three.ShaderMaterial({
      vertexShader: SHELL_VERTEX,
      fragmentShader: CAGE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uHover: { value: 0 },
        uRim: { value: new three.Color(AMBER) },
        uOpacity: { value: 0.34 },
      },
    }),
  )
  const coreWireGeo = keep(new three.WireframeGeometry(coreGeo))
  const coreWire = new three.LineSegments(coreWireGeo, coreWireMat)
  world.add(coreWire)

  const satelliteCount = quality === 'high' ? 10 : 6
  const satellites: {
    mesh: Mesh
    mat: ShaderMaterial
    orbit: number
    speed: number
    phase: number
    tilt: number
  }[] = []

  for (let i = 0; i < satelliteCount; i++) {
    const satMat = keep(
      new three.ShaderMaterial({
        vertexShader: SHELL_VERTEX,
        fragmentShader: SHELL_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uHover: { value: 0 },
          // Two bodies: one inked, one of cold steel. Both keep the amber
          // rim — one accent for the whole hero.
          uBody: {
            value: new three.Color(i % 3 === 0 ? STEEL : INK),
          },
          uLit: {
            value: new three.Color(i % 3 === 0 ? 0x8a94b8 : INK_LIT),
          },
          uRim: { value: new three.Color(AMBER) },
          uRimPower: { value: 2.6 },
          uRimStrength: { value: 0.8 },
        },
      }),
    )
    const size = 0.22 + unitOf(i, 'size') * 0.26
    const satGeo = keep(new three.IcosahedronGeometry(size, 2))
    const satMesh = new three.Mesh(satGeo, satMat)
    world.add(satMesh)

    satellites.push({
      mesh: satMesh,
      mat: satMat,
      orbit: 3 + unitOf(i, 'orbit') * 2,
      speed: 0.3 + unitOf(i, 'speed') * 0.4,
      phase: unitOf(i, 'phase') * Math.PI * 2,
      tilt: (unitOf(i, 'tilt') - 0.5) * 0.8,
    })
  }

  /**
   * The dust of the hero: warm motes in the light of the core.
   *
   * The motes move in the shader — the frame allocates nothing and touches
   * no buffer. They are drawn with the ordinary blend: on a warm sheet an
   * additive glow is a green stain, a warm speck is dust.
   */
  const particleCount = quality === 'high' ? 240 : 96
  const particleGeo = keep(new three.BufferGeometry())
  const positions = new Float32Array(particleCount * 3)
  const phases = new Float32Array(particleCount)

  for (let i = 0; i < particleCount; i++) {
    const theta = unitOf(i, 'theta') * Math.PI * 2
    const phi = Math.acos(2 * unitOf(i, 'phi') - 1)
    const r = 5 + unitOf(i, 'radius') * 3
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    phases[i] = unitOf(i, 'phase') * Math.PI * 2
  }

  particleGeo.setAttribute('position', new three.BufferAttribute(positions, 3))
  particleGeo.setAttribute('aPhase', new three.BufferAttribute(phases, 1))

  const particleVertexShader = /* glsl */ `
    uniform float uTime;
    attribute float aPhase;
    varying float vAlpha;

    void main() {
      vec3 pos = position;
      // The drift of a mote in the light: it never leaves its own shell.
      pos.x += sin(uTime * 0.5 + aPhase) * 0.3;
      pos.y += cos(uTime * 0.4 + aPhase) * 0.3;
      pos.z += sin(uTime * 0.3 + aPhase * 2.0) * 0.2;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float dist = length(mvPosition.xyz);
      vAlpha = smoothstep(15.0, 5.0, dist) * 0.45;

      gl_PointSize = 2.2 * (1.0 + 0.25 * sin(uTime + aPhase));
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const particleFragmentShader = /* glsl */ `
    uniform vec3 uColor;
    varying float vAlpha;

    void main() {
      float dist = length(gl_PointCoord - vec2(0.5));
      if (dist > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
      gl_FragColor = vec4(uColor, alpha);
    }
  `

  const particleMat = keep(
    new three.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new three.Color(AMBER) },
      },
    }),
  )
  const particles = new three.Points(particleGeo, particleMat)
  world.add(particles)

  const raycaster = new three.Raycaster()
  const mouse = new three.Vector2()

  function update(dt: number) {
    elapsed += dt

    const ease = Math.min(1, dt * 3)
    smoothPointer.x += (pointer.x - smoothPointer.x) * ease
    smoothPointer.y += (pointer.y - smoothPointer.y) * ease

    camera.position.x = smoothPointer.x * 1.5
    camera.position.y = smoothPointer.y * 1.0
    camera.lookAt(0, 0, 0)

    coreMat.uniforms.uTime.value = elapsed
    coreMesh.rotation.y += dt * 0.15
    coreMesh.rotation.x = Math.sin(elapsed * 0.2) * 0.1
    coreWire.rotation.y = coreMesh.rotation.y
    coreWire.rotation.x = coreMesh.rotation.x
    coreWireMat.uniforms.uTime.value = elapsed

    mouse.set(pointer.x, pointer.y)
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(coreMesh)
    const isHovered = intersects.length > 0
    const hoverTarget = isHovered ? 1 : 0
    const currentHover = coreMat.uniforms.uHover.value as number
    const newHover = currentHover + (hoverTarget - currentHover) * Math.min(1, dt * 5)
    coreMat.uniforms.uHover.value = newHover
    coreWireMat.uniforms.uHover.value = newHover

    for (const sat of satellites) {
      const angle = elapsed * sat.speed + sat.phase
      sat.mesh.position.x = Math.cos(angle) * sat.orbit
      sat.mesh.position.y = Math.sin(angle * 0.7 + sat.tilt) * sat.orbit * 0.6
      sat.mesh.position.z = Math.sin(angle) * sat.orbit * 0.8

      sat.mesh.rotation.x += dt * 0.5
      sat.mesh.rotation.y += dt * 0.3

      sat.mat.uniforms.uTime.value = elapsed

      const satIntersects = raycaster.intersectObject(sat.mesh)
      const satHovered = satIntersects.length > 0
      const satHoverTarget = satHovered ? 1 : 0
      const currentSatHover = sat.mat.uniforms.uHover.value
      sat.mat.uniforms.uHover.value =
        currentSatHover + (satHoverTarget - currentSatHover) * Math.min(1, dt * 5)

      const scale = satHovered ? 1.3 : 1
      sat.mesh.scale.setScalar(scale)
    }

    particleMat.uniforms.uTime.value = elapsed
  }

  return {
    frame: update,
    dispose: () => {
      for (const d of tracked) {
        try {
          d.dispose()
        } catch {
          /* already disposed */
        }
      }
    },
  }
}

const { active, sessionKey } = useThreeScene(canvasRef, build, {
  priority: SCENE_PRIORITY.hero,
})
</script>

<template>
  <div ref="containerRef" class="network-core-container">
    <canvas
      v-if="active"
      :key="sessionKey"
      ref="canvasRef"
      class="network-core-canvas"
      aria-hidden="true"
    ></canvas>
  </div>
</template>

<style scoped>
.network-core-container {
  position: fixed;
  inset: 0;
  z-index: 0;
  /* The core is a picture, not a surface: it never takes a click away from
     the page. The pointer is read from the window anyway. */
  pointer-events: none;
  overflow: hidden;
}

.network-core-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
