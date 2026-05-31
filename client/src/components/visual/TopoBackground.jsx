import { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../theme/ThemeProvider'

const DRAW_DURATION_MS = 3500
const MORPH_LOOP_MS = 90000
const MORPH_FRAME_MS = 1000 / 24
const MAX_GRID_CELLS = 48
const MIN_GRID_CELLS = 30
const CONTOUR_LEVELS = [-0.38, -0.08, 0.22, 0.52]
const DARK_GOLD = '#c9971f'
const LIGHT_GOLD = '#b4821e'
const DARK_BACKGROUND = '#000'
const LIGHT_BACKGROUND = '#faf8f3'

const containerStyle = {
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: 'none',
  zIndex: 0,
  overflow: 'hidden',
}

const svgStyle = {
  display: 'block',
  width: '100%',
  height: '100%',
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function easeOutExpo(value) {
  if (value >= 1) return 1
  return 1 - 2 ** (-10 * value)
}

function fract(value) {
  return value - Math.floor(value)
}

function fade(value) {
  return value * value * value * (value * (value * 6 - 15) + 10)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function hashGrid(x, y, seed) {
  return fract(Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123) * 2 - 1
}

function valueNoise(x, y, seed = 0) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fade(fx)
  const uy = fade(fy)

  const a = hashGrid(ix, iy, seed)
  const b = hashGrid(ix + 1, iy, seed)
  const c = hashGrid(ix, iy + 1, seed)
  const d = hashGrid(ix + 1, iy + 1, seed)

  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy)
}

function fbm(x, y, seed = 0, phase = 0) {
  let value = 0
  let amplitude = 0.62
  let frequency = 1
  let total = 0

  for (let octave = 0; octave < 3; octave += 1) {
    const angle = phase + octave * 2.17 + seed * 0.07
    const driftRadius = 0.22 / frequency

    value += valueNoise(
      x * frequency + Math.cos(angle) * driftRadius,
      y * frequency + Math.sin(angle) * driftRadius,
      seed + octave * 11.13,
    ) * amplitude
    total += amplitude
    frequency *= 1.7
    amplitude *= 0.36
  }

  return value / total
}

function fieldValue(x, y, aspect, phase) {
  const px = (x - 0.5) * aspect * 1.05
  const py = (y - 0.5) * 1.05
  const warpX = fbm(px * 0.72 + 8.2, py * 0.72 - 1.1, 31.5, phase + 1.2) * 0.12
  const warpY = fbm(px * 0.72 - 4.4, py * 0.72 + 7.6, 46.8, phase + 3.1) * 0.12
  const qx = px + warpX
  const qy = py + warpY
  const broad = fbm(qx + 3.4, qy - 1.8, 4.2, phase) * 0.96
  const detail = fbm(qx * 1.25 - 7.1, qy * 1.25 + 5.6, 19.7, phase + 2.4) * 0.09
  const contourBend = Math.sin(qx * 1.0 + Math.cos(qy * 0.9 + phase) * 0.42) * 0.06

  return broad + detail + contourBend
}

function interpolationPoint(edge, x, y, cellWidth, cellHeight, corners, level) {
  const [topLeft, topRight, bottomRight, bottomLeft] = corners

  if (edge === 'top') {
    const t = (level - topLeft) / (topRight - topLeft)
    return { x: (x + clamp(t, 0, 1)) * cellWidth, y: y * cellHeight }
  }

  if (edge === 'right') {
    const t = (level - topRight) / (bottomRight - topRight)
    return { x: (x + 1) * cellWidth, y: (y + clamp(t, 0, 1)) * cellHeight }
  }

  if (edge === 'bottom') {
    const t = (level - bottomLeft) / (bottomRight - bottomLeft)
    return { x: (x + clamp(t, 0, 1)) * cellWidth, y: (y + 1) * cellHeight }
  }

  const t = (level - topLeft) / (bottomLeft - topLeft)
  return { x: x * cellWidth, y: (y + clamp(t, 0, 1)) * cellHeight }
}

function segmentKey(point) {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function polylineLength(points) {
  let length = 0

  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1], points[index])
  }

  return length
}

function nearestCornerOrder(points, width, height) {
  const centroid = points.reduce(
    (memo, point) => ({ x: memo.x + point.x / points.length, y: memo.y + point.y / points.length }),
    { x: 0, y: 0 },
  )
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ]
  const nearestCornerDistance = Math.min(...corners.map((corner) => distance(centroid, corner)))
  const centerToCorner = Math.hypot(width / 2, height / 2)

  return clamp(nearestCornerDistance / centerToCorner, 0, 1)
}

function connectSegments(segments) {
  const segmentList = segments.map((segment) => ({ ...segment, used: false }))
  const endpoints = new Map()

  segmentList.forEach((segment, index) => {
    const aKey = segmentKey(segment.a)
    const bKey = segmentKey(segment.b)

    endpoints.set(aKey, [...(endpoints.get(aKey) || []), index])
    endpoints.set(bKey, [...(endpoints.get(bKey) || []), index])
  })

  function nextUnusedSegment(point) {
    const candidates = endpoints.get(segmentKey(point)) || []
    return candidates.find((index) => !segmentList[index].used)
  }

  const polylines = []

  segmentList.forEach((segment, startIndex) => {
    if (segment.used) return

    segment.used = true
    const points = [segment.a, segment.b]

    let nextIndex = nextUnusedSegment(points[points.length - 1])
    while (nextIndex !== undefined) {
      const next = segmentList[nextIndex]
      next.used = true

      if (segmentKey(next.a) === segmentKey(points[points.length - 1])) {
        points.push(next.b)
      } else {
        points.push(next.a)
      }

      nextIndex = nextUnusedSegment(points[points.length - 1])
    }

    nextIndex = nextUnusedSegment(points[0])
    while (nextIndex !== undefined) {
      const next = segmentList[nextIndex]
      next.used = true

      if (segmentKey(next.a) === segmentKey(points[0])) {
        points.unshift(next.b)
      } else {
        points.unshift(next.a)
      }

      nextIndex = nextUnusedSegment(points[0])
    }

    if (points.length > 3 && startIndex >= 0) {
      polylines.push(points)
    }
  })

  return polylines
}

function pointsToPath(points) {
  const isClosed = distance(points[0], points[points.length - 1]) < 1.5
  const pathPoints = isClosed ? points.slice(0, -1) : points

  if (pathPoints.length < 2) return ''

  const commands = [`M ${pathPoints[0].x.toFixed(1)} ${pathPoints[0].y.toFixed(1)}`]

  for (let index = 0; index < pathPoints.length - 1; index += 1) {
    const previous = pathPoints[index - 1] || pathPoints[index]
    const current = pathPoints[index]
    const next = pathPoints[index + 1]
    const afterNext = pathPoints[index + 2] || next
    const cp1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    }
    const cp2 = {
      x: next.x - (afterNext.x - current.x) / 6,
      y: next.y - (afterNext.y - current.y) / 6,
    }

    commands.push(
      `C ${cp1.x.toFixed(1)} ${cp1.y.toFixed(1)} ${cp2.x.toFixed(1)} ${cp2.y.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`,
    )
  }

  return isClosed ? `${commands.join(' ')} Z` : commands.join(' ')
}

function buildContourPaths(width, height, morphPhase) {
  const aspect = width / height
  const columns = aspect >= 1
    ? MAX_GRID_CELLS
    : Math.max(MIN_GRID_CELLS, Math.round(MAX_GRID_CELLS * aspect))
  const rows = aspect >= 1
    ? Math.max(MIN_GRID_CELLS, Math.round(MAX_GRID_CELLS / aspect))
    : MAX_GRID_CELLS
  const cellWidth = width / columns
  const cellHeight = height / rows
  const values = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => fieldValue(column / columns, row / rows, aspect, morphPhase)),
  )

  return CONTOUR_LEVELS.flatMap((level, levelIndex) => {
    const segments = []

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const corners = [
          values[row][column],
          values[row][column + 1],
          values[row + 1][column + 1],
          values[row + 1][column],
        ]
        const crossings = []

        if ((corners[0] < level) !== (corners[1] < level)) {
          crossings.push(interpolationPoint('top', column, row, cellWidth, cellHeight, corners, level))
        }

        if ((corners[1] < level) !== (corners[2] < level)) {
          crossings.push(interpolationPoint('right', column, row, cellWidth, cellHeight, corners, level))
        }

        if ((corners[3] < level) !== (corners[2] < level)) {
          crossings.push(interpolationPoint('bottom', column, row, cellWidth, cellHeight, corners, level))
        }

        if ((corners[0] < level) !== (corners[3] < level)) {
          crossings.push(interpolationPoint('left', column, row, cellWidth, cellHeight, corners, level))
        }

        if (crossings.length === 2) {
          segments.push({ a: crossings[0], b: crossings[1] })
        } else if (crossings.length === 4) {
          segments.push({ a: crossings[0], b: crossings[1] }, { a: crossings[2], b: crossings[3] })
        }
      }
    }

    return connectSegments(segments)
      .filter((points) => polylineLength(points) > Math.min(width, height) * 0.12)
      .map((points, pathIndex) => ({
        d: pointsToPath(points),
        key: `${levelIndex}-${pathIndex}-${points.length}`,
        levelIndex,
        cornerOrder: nearestCornerOrder(points, width, height),
        length: polylineLength(points),
      }))
      .filter((path) => path.d)
  }).sort((a, b) => a.cornerOrder - b.cornerOrder)
}

function getViewportSize() {
  if (typeof window === 'undefined') return { width: 1200, height: 800 }

  return {
    width: Math.max(window.innerWidth, 1),
    height: Math.max(window.innerHeight, 1),
  }
}

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function TopoBackground({ phase = 'idle' }) {
  const { theme } = useTheme()
  const [viewport, setViewport] = useState({ width: 1200, height: 800 })
  const [reducedMotion, setReducedMotion] = useState(() => prefersReducedMotion())
  const [drawProgress, setDrawProgress] = useState(() => (reducedMotion || phase !== 'enter' ? 1 : 0))
  const [morphPhase, setMorphPhase] = useState(0)
  const contours = useMemo(() => buildContourPaths(viewport.width, viewport.height, morphPhase), [morphPhase, viewport])
  const isLightTheme = theme === 'light'
  const backgroundColor = isLightTheme ? LIGHT_BACKGROUND : DARK_BACKGROUND
  const strokeColor = isLightTheme ? LIGHT_GOLD : DARK_GOLD

  useEffect(() => {
    let animationFrame = 0

    function updateViewport() {
      setViewport(getViewportSize())
    }

    function handleResize() {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = window.requestAnimationFrame(updateViewport)
    }

    animationFrame = window.requestAnimationFrame(updateViewport)
    window.addEventListener('resize', handleResize)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')

    function handleMotionChange(event) {
      setReducedMotion(event.matches)
    }

    motionQuery.addEventListener('change', handleMotionChange)

    return () => {
      motionQuery.removeEventListener('change', handleMotionChange)
    }
  }, [])

  useEffect(() => {
    let animationFrame = 0

    if (reducedMotion || phase === 'idle') {
      animationFrame = window.requestAnimationFrame(() => {
        setDrawProgress(1)
      })

      return () => {
        window.cancelAnimationFrame(animationFrame)
      }
    }

    const startedAt = performance.now()
    const from = phase === 'exit' ? 1 : 0
    const to = phase === 'exit' ? 0 : 1

    function animate(now) {
      const rawProgress = clamp((now - startedAt) / DRAW_DURATION_MS, 0, 1)
      const easedProgress = easeOutExpo(rawProgress)

      setDrawProgress(lerp(from, to, easedProgress))

      if (rawProgress < 1) {
        animationFrame = window.requestAnimationFrame(animate)
      }
    }

    animationFrame = window.requestAnimationFrame(animate)

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [phase, reducedMotion])

  useEffect(() => {
    const morphEnabled = !reducedMotion && phase !== 'exit' && drawProgress >= 0.999

    if (!morphEnabled) return undefined

    let animationFrame = 0
    let lastFrameAt = 0
    const startedAt = performance.now()

    function morph(now) {
      if (now - lastFrameAt >= MORPH_FRAME_MS) {
        lastFrameAt = now
        setMorphPhase((((now - startedAt) % MORPH_LOOP_MS) / MORPH_LOOP_MS) * Math.PI * 2)
      }

      animationFrame = window.requestAnimationFrame(morph)
    }

    animationFrame = window.requestAnimationFrame(morph)

    return () => {
      window.cancelAnimationFrame(animationFrame)
    }
  }, [drawProgress, phase, reducedMotion])

  const staggerSpan = reducedMotion ? 0 : 0.42

  return (
    <div className="topo-background" style={{ ...containerStyle, background: backgroundColor }} aria-hidden="true">
      <svg
        style={{ ...svgStyle, background: backgroundColor }}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="none"
        role="presentation"
      >
        <rect width={viewport.width} height={viewport.height} fill={backgroundColor} />
        <g>
          {contours.map((contour, index) => {
            const stagger = contour.cornerOrder * staggerSpan
            const localProgress = reducedMotion
              ? 1
              : clamp((drawProgress - stagger) / Math.max(1 - stagger, 0.001), 0, 1)

            return (
              <path
                key={`contour-${index}`}
                d={contour.d}
                pathLength="1"
                fill="none"
                stroke={strokeColor}
                strokeWidth="1.25"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                strokeDasharray="1"
                strokeDashoffset={(1 - localProgress).toFixed(4)}
              />
            )
          })}
        </g>
      </svg>
    </div>
  )
}
