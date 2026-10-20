<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { Mesh, ShaderMaterial } from 'three'
import { useThreeScene, type ThreeBuildResult, type ThreeContext } from '@/composables/useThreeScene'

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
  scene.add(world)

  const pointer = { x: 0, y: 0 }
  const smoothPointer = { x: 0, y: 0 }
  let elapsed = 0

  const VERTEX_SHADER = /* glsl */ `
    uniform float uTime;
    uniform float uHover;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vDisplacement;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      
      float displacement = sin(position.x * 3.0 + uTime) * 
                          cos(position.y * 3.0 + uTime * 0.8) * 
                          sin(position.z * 3.0 + uTime * 1.2) * 0.15;
      displacement *= (1.0 + uHover * 0.5);
      
      vec3 newPosition = position + normal * displacement;
      vDisplacement = displacement;
      
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `

  const FRAGMENT_SHADER = /* glsl */ `
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform float uTime;
    uniform float uHover;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vDisplacement;
    
    void main() {
      vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
      float diffuse = max(dot(vNormal, lightDir), 0.0);
      float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
      rim = pow(rim, 3.0);
      
      vec3 color = mix(uColor1, uColor2, vDisplacement * 2.0 + 0.5);
      color += rim * 0.4;
      color *= 0.3 + diffuse * 0.7;
      
      float pulse = 0.9 + 0.1 * sin(uTime * 2.0 + vPosition.x * 5.0);
      color *= pulse;
      
      gl_FragColor = vec4(color, 0.95);
    }
  `

  const CORE_VERTEX = /* glsl */ `
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;
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
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;
      
      float n = noise(position * 2.0 + uTime * 0.3);
      n = n * 0.5 + 0.5;
      vNoise = n;
      
      vec3 pos = position + normal * n * 0.2;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `

  const CORE_FRAGMENT = /* glsl */ `
    uniform float uTime;
    uniform vec3 uColor;
    uniform float uHover;
    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vNoise;
    
    void main() {
      vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
      float diffuse = max(dot(vNormal, lightDir), 0.0);
      
      float rim = 1.0 - max(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0);
      rim = pow(rim, 2.5);
      
      vec3 color = uColor * (0.4 + diffuse * 0.6);
      color += rim * vec3(0.83, 0.53, 0.16) * 0.6;
      
      float glow = vNoise * 0.3;
      color += glow;
      
      color += uHover * 0.2;
      
      gl_FragColor = vec4(color, 0.9);
    }
  `

  const coreMat = keep(
    new three.ShaderMaterial({
      vertexShader: CORE_VERTEX,
      fragmentShader: CORE_FRAGMENT,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new three.Color(0x2F4F4E) },
        uHover: { value: 0 },
      },
    }),
  )
  const coreGeo = keep(new three.IcosahedronGeometry(1.8, quality === 'high' ? 4 : 3))
  const coreMesh = new three.Mesh(coreGeo, coreMat)
  world.add(coreMesh)

  const coreWireMat = keep(
    new three.LineBasicMaterial({
      color: 0xd4882a,
      transparent: true,
      opacity: 0.3,
    }),
  )
  const coreWireGeo = keep(new three.WireframeGeometry(coreGeo))
  const coreWire = new three.LineSegments(coreWireGeo, coreWireMat)
  world.add(coreWire)

  const satelliteCount = quality === 'high' ? 12 : 8
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
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        uniforms: {
          uTime: { value: 0 },
          uHover: { value: 0 },
          uColor1: { value: new three.Color(0x5a6480) },
          uColor2: { value: new three.Color(0xd4882a) },
        },
      }),
    )
    const size = 0.3 + Math.random() * 0.4
    const satGeo = keep(new three.IcosahedronGeometry(size, 2))
    const satMesh = new three.Mesh(satGeo, satMat)
    world.add(satMesh)

    satellites.push({
      mesh: satMesh,
      mat: satMat,
      orbit: 3 + Math.random() * 2,
      speed: 0.3 + Math.random() * 0.4,
      phase: Math.random() * Math.PI * 2,
      tilt: (Math.random() - 0.5) * 0.8,
    })
  }

  const textCanvas = document.createElement('canvas')
  textCanvas.width = 1024
  textCanvas.height = 256
  const textCtx = textCanvas.getContext('2d')
  if (textCtx) {
    textCtx.fillStyle = 'rgba(0,0,0,0)'
    textCtx.fillRect(0, 0, 1024, 256)
    textCtx.font = 'bold 120px "Cormorant Garamond", serif'
    textCtx.textAlign = 'center'
    textCtx.textBaseline = 'middle'
    textCtx.fillStyle = 'rgba(212, 136, 42, 0.9)'
    textCtx.fillText('BMSTUDvach', 512, 128)
  }
  const textTexture = keep(new three.CanvasTexture(textCanvas))
  const textMat = keep(
    new three.MeshBasicMaterial({
      map: textTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    }),
  )
  const textGeo = keep(new three.PlaneGeometry(8, 2))
  const textMesh = new three.Mesh(textGeo, textMat)
  textMesh.position.set(0, -3.5, 0)
  world.add(textMesh)

  const particleCount = quality === 'high' ? 500 : 200
  const particleGeo = keep(new three.BufferGeometry())
  const positions = new Float32Array(particleCount * 3)
  const velocities = new Float32Array(particleCount * 3)
  const phases = new Float32Array(particleCount)

  for (let i = 0; i < particleCount; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const r = 5 + Math.random() * 3
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = r * Math.cos(phi)
    velocities[i * 3] = (Math.random() - 0.5) * 0.02
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02
    phases[i] = Math.random() * Math.PI * 2
  }

  particleGeo.setAttribute('position', new three.BufferAttribute(positions, 3))
  particleGeo.setAttribute('aPhase', new three.BufferAttribute(phases, 1))

  const particleVertexShader = /* glsl */ `
    uniform float uTime;
    attribute float aPhase;
    varying float vAlpha;
    
    void main() {
      vec3 pos = position;
      pos.x += sin(uTime * 0.5 + aPhase) * 0.3;
      pos.y += cos(uTime * 0.4 + aPhase) * 0.3;
      pos.z += sin(uTime * 0.3 + aPhase * 2.0) * 0.2;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      float dist = length(mvPosition.xyz);
      vAlpha = smoothstep(15.0, 5.0, dist) * 0.6;
      
      gl_PointSize = 2.5 * (1.0 + 0.3 * sin(uTime + aPhase));
      gl_Position = projectionMatrix * mvPosition;
    }
  `

  const particleFragmentShader = /* glsl */ `
    varying float vAlpha;
    
    void main() {
      float dist = length(gl_PointCoord - vec2(0.5));
      if (dist > 0.5) discard;
      float alpha = smoothstep(0.5, 0.0, dist) * vAlpha;
      gl_FragColor = vec4(0.83, 0.53, 0.16, alpha);
    }
  `

  const particleMat = keep(
    new three.ShaderMaterial({
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: three.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
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

    mouse.set(pointer.x, pointer.y)
    raycaster.setFromCamera(mouse, camera)
    const intersects = raycaster.intersectObject(coreMesh)
    const isHovered = intersects.length > 0
    const hoverTarget = isHovered ? 1 : 0
    const currentHover = coreMat.uniforms.uHover.value as number
    const newHover = currentHover + (hoverTarget - currentHover) * Math.min(1, dt * 5)
    coreMat.uniforms.uHover.value = newHover

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

    textMesh.position.x = Math.sin(elapsed * 0.3) * 0.2
    textMesh.position.y = -3.5 + Math.cos(elapsed * 0.2) * 0.1
    textMesh.material.opacity = 0.85 + Math.sin(elapsed * 0.5) * 0.1

    particleMat.uniforms.uTime.value = elapsed

    const posAttr = particleGeo.attributes.position as InstanceType<typeof three.BufferAttribute>
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] += velocities[i * 3]
      positions[i * 3 + 1] += velocities[i * 3 + 1]
      positions[i * 3 + 2] += velocities[i * 3 + 2]

      const dist = Math.sqrt(
        positions[i * 3] ** 2 +
        positions[i * 3 + 1] ** 2 +
        positions[i * 3 + 2] ** 2
      )
      if (dist > 8 || dist < 4) {
        velocities[i * 3] *= -1
        velocities[i * 3 + 1] *= -1
        velocities[i * 3 + 2] *= -1
      }
    }
    posAttr.needsUpdate = true
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

useThreeScene(canvasRef, build)
</script>

<template>
  <div ref="containerRef" class="network-core-container">
    <canvas ref="canvasRef" class="network-core-canvas" aria-hidden="true"></canvas>
  </div>
</template>

<style scoped>
.network-core-container {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: auto;
  overflow: hidden;
}

.network-core-canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
