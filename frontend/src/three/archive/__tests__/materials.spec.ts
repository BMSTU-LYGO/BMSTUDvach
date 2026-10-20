import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShaderMaterial } from 'three'

import {
  archiveUniforms,
  createArchiveUniforms,
  disposeArchiveMaterials,
  dustMaterial,
  emptyHaloMaterial,
  fragmentMaterial,
  ringMaterial,
  vaultMaterial,
} from '@/three/archive/materials'

/**
 * Unit tests for the procedural materials of the Archive Space.
 *
 * No WebGL renderer is involved: a material is pure data (shader sources +
 * uniforms), so the real `three` module is enough — the same approach
 * `src/three/__tests__/network.spec.ts` takes.
 */

let three: typeof import('three')

beforeAll(async () => {
  three = await import('three')
})

/**
 * The core uniforms are shared by every material, so they have to be reset
 * between the tests — otherwise one test would dim the archive for the next.
 */
beforeEach(() => {
  const uniforms = archiveUniforms()
  uniforms.uTime.value = 0
  uniforms.uFocus.value = 0
  uniforms.uDim.value = 1
})

function allMaterials(): ShaderMaterial[] {
  return [
    fragmentMaterial(three),
    ringMaterial(three),
    vaultMaterial(three),
    dustMaterial(three),
    emptyHaloMaterial(three),
  ]
}

describe('archive materials: uniform contract', () => {
  it('gives every factory a disposable material with the core uniforms', () => {
    for (const material of allMaterials()) {
      expect(typeof material.dispose).toBe('function')
      expect(material.uniforms.uTime).toBeDefined()
      expect(material.uniforms.uFocus).toBeDefined()
      expect(material.uniforms.uDim).toBeDefined()
      expect(typeof material.uniforms.uTime.value).toBe('number')
      expect(typeof material.uniforms.uFocus.value).toBe('number')
      expect(typeof material.uniforms.uDim.value).toBe('number')
    }
  })

  it('gives every factory the palette and quality uniforms', () => {
    for (const material of allMaterials()) {
      expect(material.uniforms.uColorA).toBeDefined()
      expect(material.uniforms.uColorB).toBeDefined()
      expect(material.uniforms.uQuality).toBeDefined()
      expect(material.uniforms.uOctaves).toBeDefined()
      expect(material.uniforms.uQuality.value).toBe(1)
      expect(material.uniforms.uOctaves.value).toBe(3)
    }
  })

  it('shares one set of core uniforms across all materials', () => {
    const [first, second] = allMaterials()
    expect(first.uniforms.uTime).toBe(second.uniforms.uTime)
    expect(first.uniforms.uFocus).toBe(second.uniforms.uFocus)
    expect(first.uniforms.uDim).toBe(second.uniforms.uDim)
  })

  it('moves the whole archive from one place', () => {
    const materials = allMaterials()
    materials[0].uniforms.uTime.value = 12.5
    materials[0].uniforms.uFocus.value = 0.5
    materials[0].uniforms.uDim.value = 0.25

    for (const material of materials) {
      expect(material.uniforms.uTime.value).toBe(12.5)
      expect(material.uniforms.uFocus.value).toBe(0.5)
      expect(material.uniforms.uDim.value).toBe(0.25)
    }
  })

  it('exposes the core uniforms through archiveUniforms', () => {
    const uniforms = archiveUniforms()
    expect(uniforms.uTime).toBeDefined()
    expect(uniforms.uFocus).toBeDefined()
    expect(uniforms.uDim).toBeDefined()
    expect(uniforms.uDim.value).toBe(1)

    const withExtra = archiveUniforms({ uPhase: { value: 2 } })
    expect(withExtra.uPhase.value).toBe(2)
    expect(withExtra.uTime).toBe(uniforms.uTime)
  })
})

describe('archive materials: the bank of a scene', () => {
  it('gives a scene a bank of its own', () => {
    const bank = createArchiveUniforms()
    const shared = archiveUniforms()
    expect(bank.uTime).not.toBe(shared.uTime)
    expect(bank.uFocus).not.toBe(shared.uFocus)
    expect(bank.uDim).not.toBe(shared.uDim)

    bank.uTime.value = 7
    expect(shared.uTime.value).toBe(0)
    expect(createArchiveUniforms().uTime.value).toBe(0)
  })

  it('wires the materials of a scene into its bank', () => {
    const bank = createArchiveUniforms()
    const plate = fragmentMaterial(three, { uniforms: bank })
    const ring = ringMaterial(three, { uniforms: bank })

    expect(plate.uniforms.uTime).toBe(bank.uTime)
    expect(plate.uniforms.uFocus).toBe(bank.uFocus)
    expect(plate.uniforms.uDim).toBe(bank.uDim)
    expect(ring.uniforms.uTime).toBe(bank.uTime)

    // The palette stays the own business of every material.
    expect(ring.uniforms.uColorA).not.toBe(plate.uniforms.uColorA)
  })

  it('moves a whole scene from one place', () => {
    const bank = createArchiveUniforms()
    const materials = [
      fragmentMaterial(three, { uniforms: bank }),
      ringMaterial(three, { uniforms: bank }),
      vaultMaterial(three, { uniforms: bank }),
      dustMaterial(three, { uniforms: bank }),
      emptyHaloMaterial(three, { uniforms: bank }),
    ]
    bank.uTime.value = 3.5
    bank.uFocus.value = 0.25
    bank.uDim.value = 0.5
    for (const material of materials) {
      expect(material.uniforms.uTime.value).toBe(3.5)
      expect(material.uniforms.uFocus.value).toBe(0.25)
      expect(material.uniforms.uDim.value).toBe(0.5)
    }
  })
})

describe('archive materials: shaders', () => {
  it('writes every fragment stage through gl_FragColor', () => {
    for (const material of allMaterials()) {
      expect(material.fragmentShader).toContain('gl_FragColor')
      expect(material.vertexShader.length).toBeGreaterThan(0)
    }
  })

  it('stays inside GLSL ES 1.00', () => {
    for (const material of allMaterials()) {
      const source = material.fragmentShader + material.vertexShader
      expect(source).not.toContain('texture(')
      expect(source).not.toContain('invert(')
      expect(source).not.toContain('gl_FragData')
      expect(source).not.toContain('#define')
      // The octave count is baked in, the placeholder must be gone.
      expect(source).not.toContain('FBM_OCTAVES')
    }
  })

  it('keeps the ring shader free of normals', () => {
    const ring = ringMaterial(three)
    expect(ring.vertexShader).not.toContain('normalMatrix')
    expect(ring.vertexShader).not.toContain('attribute vec3 normal')
    expect(ring.vertexShader).toContain('position')
  })

  it('asks for a per-point seed on the dust', () => {
    const dust = dustMaterial(three)
    expect(dust.vertexShader).toContain('aSeed')
  })
})

describe('archive materials: quality tiers', () => {
  it('gives the low tier fewer octaves than the high tier', () => {
    const builders = [
      (quality: 'high' | 'low') => fragmentMaterial(three, { quality }),
      (quality: 'high' | 'low') => ringMaterial(three, { quality }),
      (quality: 'high' | 'low') => vaultMaterial(three, { quality }),
      (quality: 'high' | 'low') => dustMaterial(three, { quality }),
      (quality: 'high' | 'low') => emptyHaloMaterial(three, { quality }),
    ]

    for (const build of builders) {
      const high = build('high')
      const low = build('low')

      expect(high.uniforms.uQuality.value).toBe(1)
      expect(low.uniforms.uQuality.value).toBe(0)
      expect(high.uniforms.uOctaves.value).toBe(3)
      expect(low.uniforms.uOctaves.value).toBe(1)
      expect(low.uniforms.uOctaves.value).toBeLessThan(high.uniforms.uOctaves.value)
    }
  })

  it('bakes a shorter noise loop into the low tier shaders', () => {
    const high = fragmentMaterial(three, { quality: 'high' })
    const low = fragmentMaterial(three, { quality: 'low' })
    expect(high.fragmentShader).toContain('for (int i = 0; i < 3; i++)')
    expect(low.fragmentShader).toContain('for (int i = 0; i < 1; i++)')
    expect(low.fragmentShader).not.toBe(high.fragmentShader)

    const highRing = ringMaterial(three, { quality: 'high' })
    const lowRing = ringMaterial(three, { quality: 'low' })
    expect(lowRing.fragmentShader).not.toBe(highRing.fragmentShader)
  })

  it('keeps the fine grain layer behind the quality branch', () => {
    // The branch is uniform, so the low tier really skips the hash instead
    // of multiplying it by zero.
    for (const quality of ['high', 'low'] as const) {
      const source = fragmentMaterial(three, { quality }).fragmentShader
      expect(source).toContain('uQuality > 0.5 ? hash21(floor(vUv * 320.0))')
      expect(source).toContain('uQuality > 0.5 ? fbm(gp) : valueNoise(gp)')
    }
  })

  it('drops the fine grain layer on the low tier', () => {
    const high = fragmentMaterial(three, { quality: 'high' })
    const low = fragmentMaterial(three, { quality: 'low' })
    expect(high.fragmentShader).toContain('step(1.5, uOctaves)')
    expect(low.fragmentShader).toContain('step(1.5, uOctaves)')
  })
})

describe('archive materials: blending and disposal', () => {
  it('keeps the fragment plate a transparent double-sided sheet', () => {
    const plate = fragmentMaterial(three)
    expect(plate.transparent).toBe(true)
    expect(plate.depthWrite).toBe(false)
    expect(plate.side).toBe(three.DoubleSide)
  })

  it('makes the dust and the empty halo purely additive', () => {
    expect(dustMaterial(three).blending).toBe(three.AdditiveBlending)
    expect(emptyHaloMaterial(three).blending).toBe(three.AdditiveBlending)
  })

  it('disposes every material of the list', () => {
    const spies = allMaterials().map(() => ({ dispose: vi.fn() }))
    disposeArchiveMaterials(spies)
    for (const spy of spies) expect(spy.dispose).toHaveBeenCalledTimes(1)
  })

  it('survives a material that throws on dispose', () => {
    const good = vi.fn()
    expect(() =>
      disposeArchiveMaterials([
        {
          dispose: () => {
            throw new Error('already disposed')
          },
        },
        { dispose: good },
      ]),
    ).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('ignores empty slots in the list', () => {
    expect(() => disposeArchiveMaterials([null, undefined])).not.toThrow()
  })

  it('takes any iterable, not only an array', () => {
    const spy = vi.fn()
    disposeArchiveMaterials(new Set([{ dispose: spy }]))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('gives the textures of a material back as well', () => {
    const texture = { isTexture: true, dispose: vi.fn() }
    const material = { dispose: vi.fn(), uniforms: { uMap: { value: texture } } }
    disposeArchiveMaterials([material])
    expect(material.dispose).toHaveBeenCalledTimes(1)
    expect(texture.dispose).toHaveBeenCalledTimes(1)
  })

  it('gives a shared texture back only once', () => {
    const texture = { isTexture: true, dispose: vi.fn() }
    const first = { dispose: vi.fn(), uniforms: { uMap: { value: texture } } }
    const second = { dispose: vi.fn(), uniforms: { uMap: { value: texture } } }
    disposeArchiveMaterials([first, second])
    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(second.dispose).toHaveBeenCalledTimes(1)
    expect(texture.dispose).toHaveBeenCalledTimes(1)
  })

  it('leaves the archive materials without a texture alone', () => {
    // The archive is fully procedural — nothing to release beyond the
    // material itself.
    for (const material of allMaterials()) {
      expect(() => disposeArchiveMaterials([material])).not.toThrow()
    }
  })
})
