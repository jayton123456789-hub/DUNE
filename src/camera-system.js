(function attachCameraSystem(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DriftCamera = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCameraSystem() {
  'use strict';

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const smoothstep = value => {
    const t = clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };

  const DEFAULT_CONFIG = Object.freeze({
    minimumZoom: 0.16,
    maximumZoom: 0.98,
    corridorBlendStart: 300,
    corridorBlendFull: 700,
    highBallAnchor: 0.23,
    highBallAnchorMinPixels: 66,
    floorInsetRatio: 0.09,
    floorInsetMinPixels: 24,
    fitPaddingPixels: 22,
    floorSafetyPixels: 24,
    floorResponseDeeper: 5,
    floorResponseShallower: 1.25,
    normalAirAnchorMin: 0.46,
    normalAirAnchorMax: 0.58,
    normalGroundAnchor: 0.57,
    normalPlayAnchorX: 0.285,
    highPlayAnchorX: 0.205,
    menuAnchorX: 0.34,
    corridorSamples: 9,
    minimumLookahead: 420,
    maximumLookahead: 2400,
    lookaheadSpeedFactor: 1.15
  });

  function sampleLandingCorridor(terrain, ball, speed, config = DEFAULT_CONFIG) {
    const forwardSpeed = Math.max(0, Number(ball.vx) || speed || 0);
    const climbAssist = Math.max(0, -(Number(ball.vy) || 0)) * 0.12;
    const lookahead = clamp(
      config.minimumLookahead + forwardSpeed * config.lookaheadSpeedFactor + climbAssist,
      config.minimumLookahead,
      config.maximumLookahead
    );
    const samples = Math.max(2, Math.floor(config.corridorSamples));
    let deepestY = -Infinity;
    let highestY = Infinity;
    let localY = NaN;

    for (let index = 0; index < samples; index += 1) {
      const fraction = index / (samples - 1);
      const x = ball.x + lookahead * fraction;
      const y = terrain.height(x);
      if (!Number.isFinite(y)) continue;
      if (index === 0) localY = y;
      deepestY = Math.max(deepestY, y);
      highestY = Math.min(highestY, y);
    }

    if (!Number.isFinite(deepestY)) deepestY = ball.y + (ball.radius || 24);
    if (!Number.isFinite(highestY)) highestY = deepestY;
    if (!Number.isFinite(localY)) localY = deepestY;
    return { lookahead, deepestY, highestY, localY };
  }

  function computeCameraTarget(options) {
    const {
      ball,
      terrain,
      viewportWidth,
      viewportHeight,
      baseScale,
      mode = 'playing',
      currentGroundReferenceY,
      dt = 0,
      config: overrides = {}
    } = options || {};
    if (!ball || !terrain || typeof terrain.height !== 'function') {
      throw new TypeError('Camera framing requires a ball and terrain.height(x).');
    }

    const config = { ...DEFAULT_CONFIG, ...overrides };
    const height = Math.max(1, Number(viewportHeight) || 1);
    const scaleBase = Math.max(0.1, Number(baseScale) || 1);
    const speed = Math.hypot(Number(ball.vx) || 0, Number(ball.vy) || 0);
    const corridor = sampleLandingCorridor(terrain, ball, speed, config);
    const localSpan = Math.max(0, corridor.localY - ball.y);
    const corridorBlend = ball.grounded ? 0 : smoothstep(
      (localSpan - config.corridorBlendStart)
      / Math.max(1, config.corridorBlendFull - config.corridorBlendStart)
    );
    const sampledGroundY = lerp(corridor.localY, corridor.deepestY, corridorBlend);
    let groundReferenceY = sampledGroundY;
    if (Number.isFinite(currentGroundReferenceY) && Number(dt) > 0) {
      const response = sampledGroundY > currentGroundReferenceY
        ? config.floorResponseDeeper
        : config.floorResponseShallower;
      groundReferenceY = lerp(
        currentGroundReferenceY,
        sampledGroundY,
        1 - Math.exp(-response * dt)
      );
    }
    const verticalSpan = Math.max(0, groundReferenceY - ball.y);
    const normalAnchorY = ball.grounded
      ? config.normalGroundAnchor
      : clamp(0.52 + (Number(ball.vy) || 0) / 7000, config.normalAirAnchorMin, config.normalAirAnchorMax);
    const normalAnchorPixels = height * normalAnchorY;
    const topPixels = Math.max(config.highBallAnchorMinPixels, height * config.highBallAnchor);
    const bottomPixels = height - Math.max(config.floorInsetMinPixels, height * config.floorInsetRatio);

    const comfortZoom = clamp(
      1.015 - speed / 4900 - verticalSpan / 7600,
      config.minimumZoom,
      config.maximumZoom
    );
    const availablePixels = Math.max(24, bottomPixels - topPixels - config.fitPaddingPixels);
    const fitZoom = verticalSpan > 1
      ? availablePixels / (scaleBase * verticalSpan)
      : config.maximumZoom;
    const targetZoom = clamp(
      ball.grounded ? comfortZoom : Math.min(comfortZoom, fitZoom),
      config.minimumZoom,
      config.maximumZoom
    );
    const limitedAnchorPixels = bottomPixels - config.floorSafetyPixels - verticalSpan * scaleBase * targetZoom;
    const anchorYPixels = ball.grounded
      ? normalAnchorPixels
      : clamp(Math.min(normalAnchorPixels, limitedAnchorPixels), topPixels, normalAnchorPixels);
    const anchorYRatio = anchorYPixels / height;
    const framingBlend = ball.grounded || normalAnchorPixels <= topPixels + 1
      ? 0
      : clamp((normalAnchorPixels - anchorYPixels) / (normalAnchorPixels - topPixels), 0, 1);
    const anchorXRatio = mode === 'menu'
      ? config.menuAnchorX
      : lerp(config.normalPlayAnchorX, config.highPlayAnchorX, framingBlend);

    return {
      targetZoom,
      framingBlend,
      anchorXRatio,
      anchorYRatio,
      groundReferenceY,
      sampledGroundY,
      highestGroundY: corridor.highestY,
      lookahead: corridor.lookahead,
      verticalSpan,
      corridorBlend,
      targetFloorScreenY: anchorYPixels + verticalSpan * scaleBase * targetZoom,
      targetBallScreenY: anchorYPixels,
      floorAnchorPixels: bottomPixels,
      topAnchorPixels: topPixels,
      floorSafetyPixels: config.floorSafetyPixels
    };
  }

  return { computeCameraTarget, sampleLandingCorridor, DEFAULT_CONFIG };
});
