// The renderer: everything the player ever sees, painted on one canvas.
// It reads the match state and paints the table — the felt, the hands, the
// life bars, the log — and it owns every animation: dealing, hovering, the
// played card's flight, floating damage numbers, the shake of a hard hit,
// and the confetti of a won match. It never changes the rules; it only
// shows them. Hit-testing lives here too, as rectangles the main loop asks
// for, so a click and a keypress can mean the same thing.
//
// Suits are told apart by colour AND shape: each house has a sigil drawn
// with canvas paths (flame, wave, leaf, sun) on its cards, its banner and
// the title legend, so the game reads at thumbnail size without any text.

import { HOUSES, HOUSE_ORDER, LAYOUT, TIMING, VIEW } from './config.js';
import { effectivePower, favorBonusFor, currentRegent } from './state.js';

export const SCREEN = {
  TITLE: 'title',
  PLAY: 'play',
  PAUSED: 'paused',
  HELP: 'help',
  DUEL_END: 'duel-end',
  WIN: 'win',
  LOSS: 'loss',
};

/** Rounded-rectangle path, the shape every card and panel is built on. */
export function roundRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

/** Fit the 1280×800 table into the window, letterboxed, and return the map. */
export function computeViewTransform(canvasWidth, canvasHeight) {
  const scale = Math.min(canvasWidth / VIEW.width, canvasHeight / VIEW.height);
  return {
    scale,
    offsetX: (canvasWidth - VIEW.width * scale) / 2,
    offsetY: (canvasHeight - VIEW.height * scale) / 2,
  };
}

/**
 * Draw one house sigil inside a box of `size` centred on (cx, cy).
 * flame: a rising tongue of fire. wave: three rolling crests. leaf: a
 * veined leaf. sun: a rayed disc. Each is a path, never text, so the suit
 * reads by shape alone at any size.
 */
export function drawSigil(ctx, sigil, cx, cy, size, color) {
  const s = size / 2;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (sigil === 'flame') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.bezierCurveTo(cx + s * 0.7, cy - s * 0.2, cx + s * 0.9, cy + s * 0.3, cx + s * 0.45, cy + s * 0.8);
    ctx.bezierCurveTo(cx + s * 0.2, cy + s * 0.95, cx - s * 0.2, cy + s * 0.95, cx - s * 0.45, cy + s * 0.8);
    ctx.bezierCurveTo(cx - s * 0.9, cy + s * 0.3, cx - s * 0.7, cy - s * 0.2, cx, cy - s);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.1);
    ctx.bezierCurveTo(cx + s * 0.3, cy + s * 0.35, cx + s * 0.2, cy + s * 0.65, cx, cy + s * 0.7);
    ctx.bezierCurveTo(cx - s * 0.2, cy + s * 0.65, cx - s * 0.3, cy + s * 0.35, cx, cy + s * 0.1);
    ctx.fill();
  } else if (sigil === 'wave') {
    for (let row = 0; row < 3; row += 1) {
      const y = cy - s * 0.6 + row * s * 0.55;
      ctx.beginPath();
      ctx.moveTo(cx - s, y);
      ctx.bezierCurveTo(cx - s * 0.5, y - s * 0.45, cx - s * 0.1, y - s * 0.45, cx + s * 0.15, y);
      ctx.bezierCurveTo(cx + s * 0.4, y + s * 0.45, cx + s * 0.7, y + s * 0.45, cx + s, y);
      ctx.stroke();
    }
  } else if (sigil === 'leaf') {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s);
    ctx.bezierCurveTo(cx + s * 0.95, cy - s * 0.4, cx + s * 0.7, cy + s * 0.7, cx, cy + s);
    ctx.bezierCurveTo(cx - s * 0.7, cy + s * 0.7, cx - s * 0.95, cy - s * 0.4, cx, cy - s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.7);
    ctx.lineTo(cx, cy + s * 0.85);
    ctx.stroke();
  } else {
    // sun: a disc with eight rays
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * s * 0.58;
      const y1 = cy + Math.sin(angle) * s * 0.58;
      const x2 = cx + Math.cos(angle) * s * 0.95;
      const y2 = cy + Math.sin(angle) * s * 0.95;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The back of a card: deep indigo, a gold frame, the house sigil, no text. */
export function drawCardBack(ctx, x, y, width, height, houseId, small = false) {
  const house = HOUSES[houseId] || HOUSES.ember;
  roundRectPath(ctx, x, y, width, height, 10);
  ctx.fillStyle = '#23233d';
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 2;
  ctx.stroke();
  roundRectPath(ctx, x + 6, y + 6, width - 12, height - 12, 7);
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  drawSigil(ctx, house.sigil, x + width / 2, y + height / 2, Math.min(width, height) * 0.52, house.color);
  if (!small) {
    ctx.fillStyle = '#c9a227';
    ctx.font = 'bold 9px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('EMBER COURT', x + width / 2, y + height - 14);
  }
}

/**
 * Where one card of the player's hand sits, fanned in an arc: the middle
 * card rides highest, the edges sag, and a hovered card lifts clear of the
 * fan. Returns the rectangle the main loop hit-tests against.
 */
export function handCardRect(index, count, hoveredIndex, selectedIndex) {
  const { cardWidth, cardHeight, handArc } = LAYOUT;
  // Overlap only when the hand would otherwise run past the table's edges;
  // never negative, or two cards would fly to opposite sides of the table.
  const overlap = count > 1 ? Math.max(0, Math.min(64, (count * cardWidth - 760) / (count - 1))) : 0;
  const step = cardWidth - overlap;
  const totalWidth = cardWidth + step * (count - 1);
  const startX = (VIEW.width - totalWidth) / 2;
  const x = startX + index * step;
  const middle = (count - 1) / 2;
  const sag = Math.abs(index - middle) * handArc * (count > 3 ? 0.6 : 1);
  let y = LAYOUT.playerHandY + sag;
  if (index === hoveredIndex) y -= 26;
  if (index === selectedIndex) y -= 40;
  return { x, y, width: cardWidth, height: cardHeight };
}

/** Every rectangle of the player's hand, in hand order, for hit-testing. */
export function playerHandRects(match, hoveredIndex, selectedIndex) {
  return match.player.hand.map((card, index) => ({
    card,
    index,
    ...handCardRect(index, match.player.hand.length, hoveredIndex, selectedIndex),
  }));
}

/** The fanned rectangles of the Regent's face-down hand at the top. */
export function regentHandRects(match) {
  const count = Math.max(1, match.regent.hand.length);
  const width = 72;
  const height = 100;
  const step = Math.min(52, 560 / count);
  const totalWidth = width + step * (count - 1);
  const startX = (VIEW.width - totalWidth) / 2;
  return match.regent.hand.map((card, index) => ({
    card,
    index,
    x: startX + index * step,
    y: LAYOUT.aiHandY - Math.abs(index - (count - 1) / 2) * 3,
    width,
    height,
  }));
}

// --- Card faces ------------------------------------------------------------

/** Wrap `text` into lines that fit `maxWidth` in the current font. */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(trial).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/**
 * Paint one card face: house-coloured band and name, a cost gem, the big
 * sigil in its art box, the power number, the effect text, and — when the
 * card continues the Favor chain — a gold ribbon naming the bonus. A card
 * the player cannot afford is dimmed; a hovered one gets a gold glow.
 */
export function drawCardFace(ctx, card, rect, match, opts = {}) {
  const house = HOUSES[card.house];
  const { x, y, width, height } = rect;
  const power = match ? effectivePower(match, card) : card.power;
  const favor = match ? favorBonusFor(match, card) : 0;
  const affordable = opts.affordable !== false;

  ctx.save();
  if (opts.glow) {
    ctx.shadowColor = house.glow;
    ctx.shadowBlur = 22;
  }
  roundRectPath(ctx, x, y, width, height, 10);
  ctx.fillStyle = '#f7f0dd';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = opts.hovered ? '#ffd94a' : house.dark;
  ctx.lineWidth = opts.hovered ? 3 : 2;
  ctx.stroke();

  // House band with the card's name.
  roundRectPath(ctx, x + 2, y + 2, width - 4, 26, 8);
  ctx.fillStyle = house.color;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(card.name.toUpperCase(), x + width / 2, y + 15, width - 40);

  // Cost gem, top-left, overlapping the band.
  ctx.beginPath();
  ctx.arc(x + 16, y + 16, 13, 0, Math.PI * 2);
  ctx.fillStyle = '#23233d';
  ctx.fill();
  ctx.strokeStyle = '#ffd94a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.fillText(String(card.cost), x + 16, y + 17);

  // Art box: the house sigil, large, on a tint of the house colour.
  const artY = y + 34;
  const artH = 62;
  ctx.fillStyle = house.light + '33';
  ctx.fillRect(x + 8, artY, width - 16, artH);
  ctx.strokeStyle = house.color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 8, artY, width - 16, artH);
  drawSigil(ctx, house.sigil, x + width / 2, artY + artH / 2, 44, house.color);

  // Effect text, wrapped, in the strip under the art box.
  ctx.fillStyle = '#2c2c3a';
  ctx.font = '11px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const lines = wrapText(ctx, card.text, width - 20);
  lines.slice(0, 2).forEach((line, i) => {
    ctx.fillText(line, x + 10, y + 110 + i * 13);
  });

  // Power: the big number at the foot of the card, with its kind beside it.
  ctx.fillStyle = '#23233d';
  ctx.font = 'bold 28px Georgia, serif';
  ctx.fillText(String(power), x + 12, y + 156);
  ctx.font = 'bold 10px Georgia, serif';
  ctx.fillStyle = house.dark;
  const kindLabel = { strike: 'DMG', pierce: 'PIERCE', guard: 'SHIELD', mend: 'HEAL', draw: 'DRAW', drain: 'DRAIN', rally: 'RALLY', kindle: 'KINDLE' }[card.kind] || 'DMG';
  const powerWidth = ctx.measureText(String(power)).width;
  ctx.fillText(kindLabel, x + 14 + powerWidth, y + 156);
  ctx.restore();

  // Favor ribbon: gold, across the card's waist, when the chain pays.
  if (favor > 0) {
    ctx.save();
    ctx.fillStyle = '#ffd94a';
    ctx.fillRect(x - 2, y + 96, width + 4, 16);
    ctx.fillStyle = '#5a3d00';
    ctx.font = 'bold 10px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`COURT FAVOR +${favor}`, x + width / 2, y + 104);
    ctx.restore();
  }

  // (The card's flavour line lives in the catalogue and is shown in the
  // table's inspector strip when the card is hovered, so the face stays
  // readable at thumbnail size.)

  if (!affordable) {
    ctx.save();
    roundRectPath(ctx, x, y, width, height, 10);
    ctx.fillStyle = 'rgba(20, 20, 32, 0.45)';
    ctx.fill();
    ctx.restore();
  }
  ctx.textBaseline = 'alphabetic';
}

// --- Table furniture -------------------------------------------------------

/** A life bar with a number, a shield count, and a name above it. */
function drawLifeBar(ctx, x, y, width, side, label, sublabel) {
  const fraction = Math.max(0, side.life / side.maxLife);
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  roundRectPath(ctx, x, y, width, 22, 11);
  ctx.fill();
  const barWidth = (width - 4) * fraction;
  const gradient = ctx.createLinearGradient(x, y, x + width, y);
  gradient.addColorStop(0, '#e5484d');
  gradient.addColorStop(1, '#ff7a6b');
  ctx.fillStyle = gradient;
  if (barWidth > 0) {
    roundRectPath(ctx, x + 2, y + 2, Math.max(10, barWidth), 18, 9);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${side.life} / ${side.maxLife}`, x + width / 2, y + 12);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f7f0dd';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.fillText(label, x, y - 8);
  ctx.fillStyle = '#c9b98a';
  ctx.font = '12px Georgia, serif';
  ctx.fillText(sublabel, x, y + 38);
  if (side.shield > 0) {
    ctx.fillStyle = '#7db8f5';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'right';
    ctx.fillText(`SHIELD ${side.shield}`, x + width, y - 8);
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

/** Energy as a row of glowing gems; spent gems are hollow. */
function drawEnergyGems(ctx, x, y, energy, maxEnergy) {
  ctx.save();
  ctx.fillStyle = '#c9b98a';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('ENERGY', x, y - 8);
  for (let i = 0; i < maxEnergy; i += 1) {
    const cx = x + 12 + i * 26;
    ctx.beginPath();
    ctx.arc(cx, y + 10, 10, 0, Math.PI * 2);
    if (i < energy) {
      ctx.fillStyle = '#3ec6e0';
      ctx.shadowColor = 'rgba(62, 198, 224, 0.8)';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx, y + 10, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.textAlign = 'left';
  }
  ctx.restore();
}

/** A labelled button; returns its rectangle for hit-testing. */
function drawButton(ctx, x, y, width, height, label, enabled, hovered) {
  ctx.save();
  roundRectPath(ctx, x, y, width, height, 9);
  ctx.fillStyle = enabled ? (hovered ? '#e8c33e' : '#c9a227') : '#55554f';
  ctx.fill();
  ctx.strokeStyle = enabled ? '#8a6410' : '#33332f';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = enabled ? '#23230f' : '#9a9a92';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + width / 2, y + height / 2 + 1);
  ctx.restore();
  return { x, y, width, height };
}

/** The battle log: the last six lines, newest on top, in a parchment panel. */
function drawLog(ctx, match) {
  const { logX, logY, logWidth, logHeight } = LAYOUT;
  ctx.save();
  roundRectPath(ctx, logX, logY, logWidth, logHeight, 10);
  ctx.fillStyle = 'rgba(20, 20, 32, 0.72)';
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = '#c9a227';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('COURT RECORD', logX + 12, logY + 22);
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.4)';
  ctx.beginPath();
  ctx.moveTo(logX + 12, logY + 30);
  ctx.lineTo(logX + logWidth - 12, logY + 30);
  ctx.stroke();
  ctx.fillStyle = '#e8e0c8';
  ctx.font = '12px Georgia, serif';
  match.log.forEach((line, i) => {
    const wrapped = wrapText(ctx, line, logWidth - 24);
    const y = logY + 48 + i * 40;
    wrapped.slice(0, 2).forEach((part, j) => {
      ctx.fillText(part, logX + 12, y + j * 14);
    });
  });
  ctx.restore();
}

/** The duel pips: two rows of gold/red dots naming who has won which duel. */
function drawDuelPips(ctx, match) {
  const cx = VIEW.width / 2;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9b98a';
  ctx.font = 'bold 12px Georgia, serif';
  ctx.fillText(`DUEL ${match.duel}`, cx, 34);
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.arc(cx - 44 + i * 18, 52, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < match.playerWins ? '#ffd94a' : 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = '#c9b98a';
  ctx.font = '11px Georgia, serif';
  ctx.fillText('YOU', cx - 78, 56);
  for (let i = 0; i < 2; i += 1) {
    ctx.beginPath();
    ctx.arc(cx + 28 + i * 18, 52, 7, 0, Math.PI * 2);
    ctx.fillStyle = i < match.regentWins ? '#e5484d' : 'rgba(255, 255, 255, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#c9a227';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillText('REGENT', cx + 92, 56);
  ctx.restore();
}

// --- Screens ----------------------------------------------------------------

/** The green baize table: felt, vignette, gold trim, and house banners. */
function drawTable(ctx, now) {
  const gradient = ctx.createRadialGradient(640, 400, 80, 640, 400, 720);
  gradient.addColorStop(0, '#2c5a34');
  gradient.addColorStop(0.6, '#1e4426');
  gradient.addColorStop(1, '#122b17');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  // Gold trim around the table edge.
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, VIEW.width - 20, VIEW.height - 20);
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(18, 18, VIEW.width - 36, VIEW.height - 36);
  // House banners down the left and right edges, gently breathing.
  HOUSE_ORDER.forEach((houseId, i) => {
    const house = HOUSES[houseId];
    const y = 120 + i * 150;
    const breathe = 0.85 + Math.sin(now / 900 + i * 1.7) * 0.15;
    ctx.save();
    ctx.globalAlpha = breathe * 0.5;
    drawSigil(ctx, house.sigil, 44, y, 44, house.color);
    drawSigil(ctx, house.sigil, VIEW.width - 44, y, 44, house.color);
    ctx.restore();
  });
  // The centre medallion: a quiet gold ring where played cards land.
  ctx.save();
  ctx.strokeStyle = 'rgba(201, 162, 39, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(640, 330, 190, 110, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(201, 162, 39, 0.12)';
  ctx.beginPath();
  ctx.ellipse(640, 330, 190, 110, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The title screen: name, legend of the four houses, and how to play. */
function drawTitleScreen(ctx, match, best, now) {
  drawTable(ctx, now);
  // Drifting sigils behind the title, slow and large.
  HOUSE_ORDER.forEach((houseId, i) => {
    const house = HOUSES[houseId];
    const x = 180 + i * 320 + Math.sin(now / 1600 + i * 2.1) * 26;
    const y = 150 + Math.cos(now / 1300 + i) * 14;
    ctx.save();
    ctx.globalAlpha = 0.16;
    drawSigil(ctx, house.sigil, x, y, 120, house.color);
    ctx.restore();
  });
  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 84px Georgia, serif';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 18;
  ctx.fillText('EMBER COURT', 640, 250);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#f7f0dd';
  ctx.font = 'italic 26px Georgia, serif';
  ctx.fillText('Duel of the Four Houses', 640, 292);
  ctx.fillStyle = '#c9b98a';
  ctx.font = '15px Georgia, serif';
  ctx.fillText('Outplay the Regent. Win two duels. Take the Court.', 640, 330);
  ctx.restore();

  // The four houses, each with its sigil, colour and motto.
  HOUSE_ORDER.forEach((houseId, i) => {
    const house = HOUSES[houseId];
    const x = 100 + i * 280;
    const y = 380;
    ctx.save();
    roundRectPath(ctx, x, y, 240, 130, 12);
    ctx.fillStyle = 'rgba(20, 20, 32, 0.78)';
    ctx.fill();
    ctx.strokeStyle = house.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    drawSigil(ctx, house.sigil, x + 120, y + 42, 52, house.color);
    ctx.fillStyle = '#f7f0dd';
    ctx.font = 'bold 17px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(house.name.toUpperCase(), x + 120, y + 88);
    ctx.fillStyle = '#c9b98a';
    ctx.font = 'italic 12px Georgia, serif';
    ctx.fillText(`“${house.motto}”`, x + 120, y + 110);
    ctx.restore();
  });

  ctx.save();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f7f0dd';
  ctx.font = 'bold 20px Georgia, serif';
  const pulse = 0.65 + Math.sin(now / 350) * 0.35;
  ctx.globalAlpha = pulse;
  ctx.fillText('Press Enter or click to begin', 640, 580);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#c9b98a';
  ctx.font = '14px Georgia, serif';
  ctx.fillText('Click a card (or press 1–8) to play it · Space ends your turn · M mutes · H shows the rules', 640, 614);
  ctx.fillText('Same house twice in a row earns Court Favor: +2 power. Shield fades at the start of your turn.', 640, 638);
  if (best && best.wins > 0) {
    ctx.fillStyle = '#ffd94a';
    ctx.font = 'bold 14px Georgia, serif';
    ctx.fillText(`Your record: ${best.wins} match${best.wins === 1 ? '' : 'es'} won · best ${best.bestTurns} turns`, 640, 676);
  }
  ctx.restore();
}

/** The play table: both hands, life bars, energy, log, buttons, inspector. */
function drawPlayTable(ctx, match, ui, now, opts = {}) {
  const regent = currentRegent(match);
  drawTable(ctx, now);

  // Top bar: the game's name, the duel pips, mute and help.
  ctx.save();
  ctx.fillStyle = '#f7f0dd';
  ctx.font = 'bold 18px Georgia, serif';
  ctx.textAlign = 'left';
  ctx.fillText('EMBER COURT', 28, 36);
  ctx.restore();
  drawDuelPips(ctx, match);
  ui.buttons.mute = drawButton(ctx, 1150, 16, 52, 30, ui.muted ? 'MUTED' : 'SOUND', true, ui.hoverButton === 'mute');
  ui.buttons.help = drawButton(ctx, 1208, 16, 52, 30, '?', true, ui.hoverButton === 'help');

  // The Regent: name, life bar, and his face-down hand.
  drawLifeBar(ctx, 28, 66, 300, match.regent, regent.name, regent.title);
  regentHandRects(match).forEach((rect, i) => {
    drawCardBack(ctx, rect.x, rect.y, rect.width, rect.height, HOUSE_ORDER[i % 4], true);
  });

  // The Regent's mood line, under his hand: his plan, in plain words.
  ctx.save();
  ctx.fillStyle = '#e8e0c8';
  ctx.font = 'italic 14px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(ui.moodLine, 640, 232);
  ctx.restore();

  // The centre: the last played card, shown large while it resolves.
  if (ui.playedCard) {
    const card = ui.playedCard.card;
    const rect = { x: 640 - 59, y: 252, width: 118, height: 164 };
    drawCardFace(ctx, card, rect, match, { glow: true });
    ctx.save();
    ctx.fillStyle = '#f7f0dd';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(ui.playedCard.byRegent ? 'The Regent plays' : 'You play', 640, 244);
    ctx.restore();
  }

  // The log, on the right.
  drawLog(ctx, match);

  // Deck and discard piles, with counts, at the table's left flank — clear
  // of the log panel on the right and of the life bars below.
  ctx.save();
  drawCardBack(ctx, 52, 400, 72, 100, 'ember', true);
  ctx.fillStyle = '#f7f0dd';
  ctx.font = 'bold 13px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Deck ${match.player.deck.length}`, 88, 518);
  if (match.player.discard.length > 0) {
    const top = match.player.discard[match.player.discard.length - 1];
    drawCardBack(ctx, 140, 400, 72, 100, top.house, true);
  }
  ctx.fillText(`Discard ${match.player.discard.length}`, 176, 518);
  ctx.restore();

  // The player's life bar, energy, and the End Turn button.
  drawLifeBar(ctx, 28, 548, 300, match.player, 'You', 'Challenger of the Court');
  drawEnergyGems(ctx, 360, 548, match.player.energy, match.player.maxEnergy);
  const canEnd = match.phase === 'play';
  ui.buttons.endTurn = drawButton(ctx, 1050, 640, 180, 52, match.phase === 'ai-turn' ? 'Regent…' : 'End Turn', canEnd, ui.hoverButton === 'endTurn');
  ctx.save();
  ctx.fillStyle = '#c9b98a';
  ctx.font = '12px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('Turn ' + match.turn, 1140, 712);
  ctx.restore();

  // The player's hand, fanned at the foot of the table — hidden behind an
  // end-of-duel overlay, where it would only poke out from under the panel.
  if (!opts.hideHand) {
    const rects = playerHandRects(match, ui.hoveredCard, ui.selectedCard);
    rects.forEach((rect) => {
      const affordable = match.phase === 'play' && match.player.energy >= rect.card.cost;
      drawCardFace(ctx, rect.card, rect, match, {
        hovered: rect.index === ui.hoveredCard,
        affordable,
        glow: rect.index === ui.hoveredCard,
      });
    });
    ui.handRects = rects;
  } else {
    ui.handRects = [];
  }

  // Inspector strip: the hovered card's flavour line, under the hand.
  const hovered = ui.hoveredCard >= 0 ? match.player.hand[ui.hoveredCard] : null;
  if (hovered && !opts.hideHand) {
    ctx.save();
    ctx.fillStyle = '#e8e0c8';
    ctx.font = 'italic 14px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText(`“${hovered.flavor}”`, 640, 786);
    ctx.restore();
  }
}

/** A dim overlay panel with a title, lines of text, and one button. */
function drawOverlayPanel(ctx, title, titleColor, lines, buttonLabel, ui, buttonId) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 18, 0.72)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const panel = { x: 340, y: 170, width: 600, height: 420 };
  roundRectPath(ctx, panel.x, panel.y, panel.width, panel.height, 16);
  ctx.fillStyle = '#23233d';
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = titleColor;
  ctx.font = 'bold 52px Georgia, serif';
  ctx.fillText(title, 640, panel.y + 92);
  ctx.fillStyle = '#e8e0c8';
  ctx.font = '16px Georgia, serif';
  lines.forEach((line, i) => ctx.fillText(line, 640, panel.y + 150 + i * 30));
  ui.buttons[buttonId] = drawButton(ctx, 520, panel.y + 330, 240, 54, buttonLabel, true, ui.hoverButton === buttonId);
  ctx.fillStyle = '#c9b98a';
  ctx.font = '13px Georgia, serif';
  ctx.fillText('or press Enter', 640, panel.y + 412);
  ctx.restore();
}

/** The rules, as a help overlay over the table. */
function drawHelpOverlay(ctx, ui) {
  ctx.save();
  ctx.fillStyle = 'rgba(10, 10, 18, 0.78)';
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
  const panel = { x: 290, y: 110, width: 700, height: 580 };
  roundRectPath(ctx, panel.x, panel.y, panel.width, panel.height, 16);
  ctx.fillStyle = '#23233d';
  ctx.fill();
  ctx.strokeStyle = '#c9a227';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94a';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('HOW TO PLAY', 640, panel.y + 58);
  ctx.fillStyle = '#e8e0c8';
  ctx.font = '15px Georgia, serif';
  ctx.textAlign = 'left';
  const rules = [
    '• You and the Regent each hold 30 life. Reduce the Regent to 0 to win the duel.',
    '• Win two duels to take the Court. The Regent grows tougher every duel.',
    '• Each turn you gain energy (up to 6) and draw 2 cards. Cards cost energy to play.',
    '• Cards deal damage, raise shield, heal, or draw. Shield soaks damage, then fades.',
    '• COURT FAVOR: play two cards of the same house in a row for +2 power each.',
    '• RALLY cards gain +3 while a Favor chain runs. KINDLE cards grow with Ember.',
    '• The Regent telegraphs his mood in the centre of the table — read it and answer.',
    '• Click a card or press 1–8 to play it. Space ends your turn. M mutes. Esc pauses.',
  ];
  rules.forEach((line, i) => ctx.fillText(line, panel.x + 36, panel.y + 104 + i * 32));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#c9b98a';
  ctx.font = '14px Georgia, serif';
  ctx.fillText('Houses — Ember burns, Tide controls, Thorn endures, Gild collects.', 640, panel.y + 380);
  HOUSE_ORDER.forEach((houseId, i) => {
    const house = HOUSES[houseId];
    drawSigil(ctx, house.sigil, 420 + i * 140, panel.y + 420, 44, house.color);
    ctx.fillStyle = '#f7f0dd';
    ctx.font = 'bold 13px Georgia, serif';
    ctx.fillText(house.name, 420 + i * 140, panel.y + 452);
  });
  ui.buttons.closeHelp = drawButton(ctx, 520, panel.y + 490, 240, 50, 'Back to the table', true, ui.hoverButton === 'closeHelp');
  ctx.restore();
}

// --- The renderer ----------------------------------------------------------

/**
 * Create the renderer for one canvas. `draw(match, ui, screen, best)` paints
 * a frame; `notifyEvent(event)` feeds it the match's transient events so it
 * can float a damage number, shake the table, or start the confetti. The
 * `ui` object is shared with the main loop: it carries hover state, button
 * rectangles (written here, read by the loop for clicks), and the mood line.
 */
export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const fx = {
    floats: [], // {x, y, text, color, born, life}
    confetti: [], // {x, y, vx, vy, color, size, spin}
    shakeUntil: 0,
    shakePower: 0,
    playedCard: null, // {card, byRegent, born}
  };

  function spawnFloat(x, y, text, color) {
    fx.floats.push({ x, y, text, color, born: performance.now(), life: TIMING.floatTextLife });
  }

  function spawnConfetti() {
    const colors = ['#ffd94a', '#e5484d', '#3e8fe0', '#46a758', '#e8b93e', '#f7f0dd'];
    for (let i = 0; i < TIMING.confettiCount; i += 1) {
      fx.confetti.push({
        x: Math.random() * VIEW.width,
        y: -20 - Math.random() * 240,
        vx: (Math.random() - 0.5) * 60,
        vy: 90 + Math.random() * 140,
        color: colors[i % colors.length],
        size: 5 + Math.random() * 7,
        spin: (Math.random() - 0.5) * 8,
        angle: Math.random() * Math.PI,
      });
    }
  }

  /** Confetti already mid-fall across the frame, for the victory screenshot. */
  function scatterConfetti() {
    spawnConfetti();
    fx.confetti.forEach((p) => {
      p.y = Math.random() * 520;
    });
  }

  function drawFloats(now) {
    fx.floats = fx.floats.filter((f) => now - f.born < f.life);
    fx.floats.forEach((f) => {
      const age = (now - f.born) / f.life;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = f.color;
      ctx.font = 'bold 30px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 6;
      ctx.fillText(f.text, f.x, f.y - age * 46);
      ctx.restore();
    });
  }

  function drawConfetti(now, deltaSeconds) {
    fx.confetti.forEach((p) => {
      p.x += p.vx * deltaSeconds;
      p.y += p.vy * deltaSeconds;
      p.angle += p.spin * deltaSeconds;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    });
    fx.confetti = fx.confetti.filter((p) => p.y < VIEW.height + 30);
  }

  const renderer = {
    canvas,
    ctx,

    /** Confetti already mid-fall across the frame, for the victory screenshot. */
    scatterConfetti,

    /** Feed the match's transient events into the effects layer. */
    notifyEvent(event, match) {
      const now = performance.now();
      if (event.kind === 'damage') {
        const isRegent = event.side === 'regent';
        spawnFloat(isRegent ? 640 : 178, isRegent ? 130 : 612, `-${event.amount}`, '#ff6b5e');
        fx.shakeUntil = now + TIMING.shakeTime;
        fx.shakePower = 7;
      } else if (event.kind === 'shield-block') {
        spawnFloat(event.side === 'regent' ? 640 : 178, event.side === 'regent' ? 130 : 612, `blocked ${event.amount}`, '#7db8f5');
      } else if (event.kind === 'card-played') {
        fx.playedCard = { card: event.card, byRegent: event.byRegent, born: now };
      } else if (event.kind === 'match-win') {
        spawnConfetti();
      }
    },

    /** The rectangles the main loop hit-tests this frame, by button name. */
    buttons() {
      return renderer._ui ? renderer._ui.buttons : {};
    },

    /** Paint one frame for `screen`, reading `match` and `ui`. */
    draw(match, ui, screen, best) {
      const now = performance.now();
      const width = canvas.width;
      const height = canvas.height;
      const view = computeViewTransform(width, height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0c0c14';
      ctx.fillRect(0, 0, width, height);
      ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);
      // The table shakes for a moment after a hard hit.
      if (now < fx.shakeUntil) {
        const power = fx.shakePower * ((fx.shakeUntil - now) / TIMING.shakeTime);
        ctx.translate((Math.random() - 0.5) * power * 2, (Math.random() - 0.5) * power * 2);
      }
      renderer._ui = ui;
      ui.buttons = {};
      ui.playedCard = fx.playedCard && now - fx.playedCard.born < 1400 ? fx.playedCard : null;
      if (now - (fx.playedCard ? fx.playedCard.born : 0) > 1400) fx.playedCard = null;

      if (screen === SCREEN.TITLE) {
        drawTitleScreen(ctx, match, best, now);
      } else if (screen === SCREEN.WIN) {
        drawPlayTable(ctx, match, ui, now, { hideHand: true });
        drawConfetti(now, 1 / 60);
        drawOverlayPanel(ctx, 'VICTORY', '#ffd94a', [
          'The Court is yours. The Regent kneels, and the four houses cheer your name.',
          `Duels won ${match.playerWins} – ${match.regentWins} · ${match.stats.cardsPlayed} cards played · ${match.stats.damageDealt} damage dealt`,
          `Finished in ${match.stats.turns} turns. The crowd is already singing about it.`,
        ], 'Play again', ui, 'playAgain');
      } else if (screen === SCREEN.LOSS) {
        drawPlayTable(ctx, match, ui, now, { hideHand: true });
        drawOverlayPanel(ctx, 'DEFEAT', '#e5484d', [
          'The Regent keeps the Court — this time. The houses murmur, unimpressed.',
          `Duels lost ${match.regentWins} – ${match.playerWins} · ${match.stats.cardsPlayed} cards played · ${match.stats.damageDealt} damage dealt`,
          'Study his moods, chain your houses, and come back for the rematch.',
        ], 'Try again', ui, 'playAgain');
      } else if (screen === SCREEN.DUEL_END) {
        drawPlayTable(ctx, match, ui, now, { hideHand: true });
        const won = match.lastDuelWinner === 'player';
        const regent = currentRegent(match);
        drawOverlayPanel(ctx, won ? 'DUEL WON' : 'DUEL LOST', won ? '#ffd94a' : '#e5484d', [
          won ? `${regent.name} falls. One duel closer to the Court.` : `${regent.name} stands. The Court is not yours yet.`,
          `Score: you ${match.playerWins} – ${match.regentWins} ${regent.name}`,
          won ? 'The next Regent is already shuffling.' : 'The same Regent waits, unimpressed.',
        ], 'Next duel', ui, 'nextDuel');
      } else {
        drawPlayTable(ctx, match, ui, now);
        if (screen === SCREEN.PAUSED) {
          drawOverlayPanel(ctx, 'PAUSED', '#f7f0dd', [
            'The Court waits. The cards are patient; the Regent is not.',
            'Esc resumes. M mutes the music.',
          ], 'Resume', ui, 'resume');
          ui.buttons.restart = drawButton(ctx, 520, 560, 240, 44, 'Restart match', true, ui.hoverButton === 'restart');
        } else if (screen === SCREEN.HELP) {
          drawHelpOverlay(ctx, ui);
        }
      }
      drawFloats(now);
      // The played card fades out after its moment in the centre.
      if (ui.playedCard) {
        const age = now - ui.playedCard.born;
        if (age > 1100) fx.playedCard = null;
      }
    },
  };
  return renderer;
}
