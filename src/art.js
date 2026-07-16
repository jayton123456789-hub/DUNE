(function attachDriftArt(root, factory) {
  root.DriftArt = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createDriftArt() {
  'use strict';

  const TAU = Math.PI * 2;
  const ballCache = new Map();
  let coinSprite = null;

  function makeCanvas(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  function pathStroke(context, color, width, build) {
    context.strokeStyle = color;
    context.lineWidth = width;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    build(context);
    context.stroke();
  }

  function drawDecal(context, skin, center, radius) {
    const pattern = skin.pattern || skin.id || 'aqua';
    const primary = skin.primary || '#20cbd2';
    const secondary = skin.secondary || '#0c8193';

    if (pattern === 'aqua') {
      pathStroke(context, primary, radius * 0.26, c => {
        c.moveTo(center - radius * 1.08, center + radius * 0.54);
        c.bezierCurveTo(center - radius * 0.42, center + radius * 0.42, center + radius * 0.2, center - radius * 0.58, center + radius * 1.08, center - radius * 0.48);
      });
      pathStroke(context, secondary, radius * 0.075, c => {
        c.moveTo(center - radius, center + radius * 0.67);
        c.bezierCurveTo(center - radius * 0.33, center + radius * 0.5, center + radius * 0.28, center - radius * 0.43, center + radius, center - radius * 0.38);
      });
    } else if (pattern === 'coral') {
      for (const offset of [-0.25, 0.25]) {
        pathStroke(context, offset < 0 ? primary : secondary, radius * 0.17, c => {
          c.moveTo(center - radius * 1.05, center + radius * offset);
          c.bezierCurveTo(center - radius * 0.3, center - radius * (0.55 - offset), center + radius * 0.3, center + radius * (0.55 + offset), center + radius * 1.05, center - radius * offset);
        });
      }
    } else if (pattern === 'sunset') {
      context.fillStyle = primary;
      context.beginPath();
      context.arc(center, center, radius * 0.34, 0, TAU);
      context.fill();
      context.strokeStyle = secondary;
      context.lineWidth = radius * 0.105;
      for (let index = 0; index < 8; index += 1) {
        const angle = index * TAU / 8;
        context.beginPath();
        context.moveTo(center + Math.cos(angle) * radius * 0.5, center + Math.sin(angle) * radius * 0.5);
        context.lineTo(center + Math.cos(angle) * radius * 0.88, center + Math.sin(angle) * radius * 0.88);
        context.stroke();
      }
    } else if (pattern === 'violet') {
      context.strokeStyle = primary;
      context.lineWidth = radius * 0.14;
      context.beginPath();
      context.ellipse(center, center, radius * 0.82, radius * 0.36, -0.24, 0, TAU);
      context.stroke();
      context.fillStyle = secondary;
      for (const point of [[-0.76, 0.2], [0.72, -0.24]]) {
        context.beginPath();
        context.arc(center + point[0] * radius, center + point[1] * radius, radius * 0.12, 0, TAU);
        context.fill();
      }
    } else if (pattern === 'lime') {
      context.fillStyle = primary;
      context.beginPath();
      context.moveTo(center + radius * 0.1, center - radius * 0.93);
      context.lineTo(center - radius * 0.46, center + radius * 0.02);
      context.lineTo(center - radius * 0.06, center - radius * 0.02);
      context.lineTo(center - radius * 0.28, center + radius * 0.92);
      context.lineTo(center + radius * 0.53, center - radius * 0.18);
      context.lineTo(center + radius * 0.12, center - radius * 0.12);
      context.closePath();
      context.fill();
      pathStroke(context, secondary, radius * 0.07, c => {
        c.moveTo(center - radius * 0.63, center + radius * 0.5);
        c.lineTo(center + radius * 0.57, center - radius * 0.55);
      });
    } else if (pattern === 'midnight') {
      context.fillStyle = primary;
      context.beginPath();
      context.arc(center, center, radius * 0.78, 0, TAU);
      context.fill();
      context.globalCompositeOperation = 'destination-out';
      context.beginPath();
      context.arc(center + radius * 0.34, center - radius * 0.2, radius * 0.7, 0, TAU);
      context.fill();
      context.globalCompositeOperation = 'source-over';
      context.fillStyle = secondary;
      for (const point of [[0.5, -0.48, 0.08], [0.7, 0.15, 0.055], [0.24, 0.56, 0.045]]) {
        context.beginPath();
        context.arc(center + point[0] * radius, center + point[1] * radius, point[2] * radius, 0, TAU);
        context.fill();
      }
    } else {
      const colors = ['#ff5d87', '#ffca55', '#55e3be', '#5bc8ff', '#9d74ff'];
      for (let index = 0; index < 5; index += 1) {
        const angle = index * TAU / 5 - Math.PI / 2;
        context.strokeStyle = colors[index];
        context.lineWidth = radius * 0.22;
        context.lineCap = 'round';
        context.beginPath();
        context.moveTo(center, center);
        context.quadraticCurveTo(
          center + Math.cos(angle + 0.65) * radius * 0.55,
          center + Math.sin(angle + 0.65) * radius * 0.55,
          center + Math.cos(angle) * radius * 0.87,
          center + Math.sin(angle) * radius * 0.87
        );
        context.stroke();
      }
    }

    context.fillStyle = skin.core || '#ffffff';
    context.beginPath();
    context.arc(center, center, radius * 0.085, 0, TAU);
    context.fill();
  }

  function createBallLayers(skin, size = 224) {
    const key = `${skin.id || 'aqua'}:${skin.primary}:${skin.secondary}:${size}`;
    if (ballCache.has(key)) return ballCache.get(key);
    const base = makeCanvas(size);
    const decal = makeCanvas(size);
    const shine = makeCanvas(size);
    const center = size / 2;
    const radius = size * 0.45;

    const baseContext = base.getContext('2d');
    const body = baseContext.createRadialGradient(center - radius * 0.38, center - radius * 0.42, radius * 0.08, center, center, radius * 1.05);
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.52, skin.shell || '#f7ffff');
    body.addColorStop(0.82, '#dbe9e8');
    body.addColorStop(1, '#a8bec0');
    baseContext.fillStyle = body;
    baseContext.beginPath();
    baseContext.arc(center, center, radius, 0, TAU);
    baseContext.fill();
    const shade = baseContext.createRadialGradient(center + radius * 0.18, center + radius * 0.18, radius * 0.45, center + radius * 0.2, center + radius * 0.2, radius);
    shade.addColorStop(0, 'rgba(23,58,65,0)');
    shade.addColorStop(1, 'rgba(23,58,65,.13)');
    baseContext.fillStyle = shade;
    baseContext.beginPath();
    baseContext.arc(center, center, radius, 0, TAU);
    baseContext.fill();

    const decalContext = decal.getContext('2d');
    decalContext.save();
    decalContext.beginPath();
    decalContext.arc(center, center, radius * 0.96, 0, TAU);
    decalContext.clip();
    drawDecal(decalContext, skin, center, radius);
    decalContext.restore();

    const shineContext = shine.getContext('2d');
    const highlight = shineContext.createRadialGradient(center - radius * 0.36, center - radius * 0.4, 0, center - radius * 0.36, center - radius * 0.4, radius * 0.48);
    highlight.addColorStop(0, 'rgba(255,255,255,.66)');
    highlight.addColorStop(0.5, 'rgba(255,255,255,.18)');
    highlight.addColorStop(1, 'rgba(255,255,255,0)');
    shineContext.fillStyle = highlight;
    shineContext.beginPath();
    shineContext.arc(center, center, radius, 0, TAU);
    shineContext.fill();
    shineContext.strokeStyle = 'rgba(255,255,255,.94)';
    shineContext.lineWidth = size * 0.014;
    shineContext.beginPath();
    shineContext.arc(center, center, radius - size * 0.008, 0, TAU);
    shineContext.stroke();
    shineContext.strokeStyle = 'rgba(31,67,73,.16)';
    shineContext.lineWidth = size * 0.008;
    shineContext.beginPath();
    shineContext.arc(center, center, radius - size * 0.022, 0, TAU);
    shineContext.stroke();

    const layers = { base, decal, shine };
    ballCache.set(key, layers);
    if (ballCache.size > 24) ballCache.delete(ballCache.keys().next().value);
    return layers;
  }

  function drawBall(context, options) {
    const { x, y, radius, rotation = 0, skin = {}, alpha = 1, shadow = true, time = 0 } = options;
    const layers = createBallLayers(skin);
    const size = radius * 2.46;
    context.save();
    context.globalAlpha = alpha;
    context.translate(x, y);
    if (shadow) {
      context.save();
      context.shadowColor = skin.glow || 'rgba(5,63,73,.32)';
      context.shadowBlur = skin.animated ? radius * (0.55 + Math.sin(time * 0.006) * 0.12) : radius * 0.28;
      context.drawImage(layers.base, -size / 2, -size / 2, size, size);
      context.restore();
    } else context.drawImage(layers.base, -size / 2, -size / 2, size, size);
    context.save();
    context.rotate(rotation);
    context.drawImage(layers.decal, -size / 2, -size / 2, size, size);
    context.restore();
    context.drawImage(layers.shine, -size / 2, -size / 2, size, size);
    context.restore();
  }

  function createCoinSprite(size = 160) {
    if (coinSprite?.width === size) return coinSprite;
    const canvas = makeCanvas(size);
    const context = canvas.getContext('2d');
    const center = size / 2;
    const radius = size * 0.42;
    const rim = context.createLinearGradient(0, 0, size, size);
    rim.addColorStop(0, '#fff38a');
    rim.addColorStop(0.38, '#ffc62d');
    rim.addColorStop(1, '#d77a00');
    context.fillStyle = rim;
    context.beginPath();
    context.arc(center, center, radius, 0, TAU);
    context.fill();
    context.strokeStyle = '#a95800';
    context.lineWidth = size * 0.04;
    context.stroke();
    context.strokeStyle = 'rgba(255,249,158,.85)';
    context.lineWidth = size * 0.035;
    context.beginPath();
    context.arc(center, center, radius * 0.73, 0, TAU);
    context.stroke();
    context.fillStyle = '#fff4a2';
    context.beginPath();
    context.moveTo(center - radius * 0.48, center + radius * 0.18);
    context.quadraticCurveTo(center, center - radius * 0.52, center + radius * 0.48, center + radius * 0.18);
    context.quadraticCurveTo(center, center + radius * 0.5, center - radius * 0.48, center + radius * 0.18);
    context.fill();
    context.fillStyle = '#e58c00';
    context.beginPath();
    context.arc(center, center, radius * 0.13, 0, TAU);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,.7)';
    context.beginPath();
    context.ellipse(center - radius * 0.32, center - radius * 0.38, radius * 0.2, radius * 0.08, -0.65, 0, TAU);
    context.fill();
    coinSprite = canvas;
    return canvas;
  }

  function drawCoin(context, options) {
    const { x, y, radius, phase = 0, time = 0, alpha = 1, glow = true } = options;
    const sprite = createCoinSprite();
    const pulse = 0.93 + Math.sin(time * 0.005 + phase) * 0.07;
    const turn = 0.74 + Math.abs(Math.cos(time * 0.0032 + phase)) * 0.26;
    context.save();
    context.globalAlpha = alpha;
    context.translate(x, y);
    context.scale(turn, pulse);
    if (glow) {
      context.shadowColor = 'rgba(255,190,28,.58)';
      context.shadowBlur = radius * 0.6;
    }
    context.drawImage(sprite, -radius, -radius, radius * 2, radius * 2);
    context.restore();
  }

  function tracePreviewHill(context, width, height, y, amplitude, phase) {
    context.beginPath();
    context.moveTo(0, height);
    for (let x = -20; x <= width + 20; x += 8) {
      const wave = Math.sin(x / width * Math.PI * 2 + phase) * amplitude;
      const second = Math.sin(x / width * Math.PI * 4 + phase * 0.7) * amplitude * 0.18;
      context.lineTo(x, y + wave + second);
    }
    context.lineTo(width, height);
    context.closePath();
  }

  function drawWorldPreview(canvas, theme) {
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const sky = context.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(0.58, theme.skyBottom);
    sky.addColorStop(1, theme.horizon);
    context.fillStyle = sky;
    context.fillRect(0, 0, width, height);
    context.globalAlpha = 0.88;
    context.fillStyle = theme.sun;
    context.beginPath();
    context.arc(width * theme.sunX, height * theme.sunY, height * 0.13, 0, TAU);
    context.fill();
    context.globalAlpha = 0.32;
    context.fillStyle = theme.far;
    tracePreviewHill(context, width, height, height * 0.66, height * 0.12, 0.8);
    context.fill();
    context.globalAlpha = 0.55;
    context.fillStyle = theme.mid;
    tracePreviewHill(context, width, height, height * 0.77, height * 0.14, 2.3);
    context.fill();
    context.globalAlpha = 1;
    const ground = context.createLinearGradient(0, height * 0.58, 0, height);
    ground.addColorStop(0, theme.sandTop);
    ground.addColorStop(1, theme.sandDeep);
    context.fillStyle = ground;
    tracePreviewHill(context, width, height, height * 0.82, height * 0.18, 4.1);
    context.fill();
    context.strokeStyle = theme.crest;
    context.lineWidth = Math.max(3, height * 0.025);
    context.beginPath();
    for (let x = 0; x <= width; x += 8) {
      const y = height * 0.82 + Math.sin(x / width * Math.PI * 2 + 4.1) * height * 0.18 + Math.sin(x / width * Math.PI * 4 + 2.87) * height * 0.032;
      if (x === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }

  return { drawBall, drawCoin, drawWorldPreview, createBallLayers };
});
