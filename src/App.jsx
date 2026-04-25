import React, { useEffect, useRef } from "react";
import waveSpriteUrl from "./웨이브.webp";
import bgmUrl from "../뮤직.mp3";

const BASE_SPEED = 320;
const OBSTACLE_WIDTH = 44;
const OBSTACLE_SPACING = 50;
const MIN_OBSTACLE_SPACING = 8;
const SPACING_SHRINK_PER_SEC = 0.52;
const OBSTACLE_SPIKE = 22;
const PLAYER_MARGIN = 8;
const PLAYER_HITBOX_SCALE = 0.7;
const SCORE_RATE = 25;
const OBSTACLE_START_OFFSET = 0;
const OBSTACLE_START_DELAY_SEC = -2;
const SCORE_GRADIENT_OBSTACLE_SCORE = 1000;
const RAINBOW_OBSTACLE_SCORE = 1640;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function easeOutExpo(x) {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export default function App() {
  const canvasRef = useRef(null);
  const distanceRef = useRef(null);
  const bestRef = useRef(null);
  const overlayRef = useRef(null);
  const titleRef = useRef(null);
  const startBtnRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const distanceEl = distanceRef.current;
    const bestEl = bestRef.current;
    const overlay = overlayRef.current;
    const titleEl = titleRef.current;
    const startBtn = startBtnRef.current;

    const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    let obstacles = [];
    let particles = [];
    let stars = [];
    let nextObstacleX = 0;

    const waveSprite = new Image();
    waveSprite.src = waveSpriteUrl;
    const bgm = new Audio(bgmUrl);
    bgm.loop = true;
    bgm.volume = 0.2;

    const game = {
      width: 1280,
      height: 720,
      running: false,
      dead: false,
      awaitingStart: true,
      pressed: false,
      score: 0,
      displayedScore: 0,
      noDeathMode: false,
      paused: false,
      countdown: 0,
      countdownElapsed: 0,
      scrollDistance: 0,
      bgTravel: 0,
      speed: BASE_SPEED,
      obstacleSpacing: OBSTACLE_SPACING,
      best: Number(localStorage.getItem("wave-best") || 0),
      lastTs: 0,
      rafId: 0,
      nextObstacleSide: "top",
      nextGuideCenterY: null,
      player: {
        x: 260,
        y: 360,
        size: 18,
        rot: 0,
        trail: [],
      },
    };

    bestEl.textContent = `BEST SCORE ${Math.floor(game.best)}`;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * DPR);
      canvas.height = Math.floor(rect.height * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

      game.width = rect.width;
      game.height = rect.height;
      game.player.x = game.width * 0.24;

      if (!game.running && !game.dead) {
        game.player.y = game.height * 0.5;
      }

      if (stars.length === 0) {
        for (let i = 0; i < 90; i += 1) {
          stars.push({
            x: Math.random() * game.width,
            y: Math.random() * game.height,
            z: 0.35 + Math.random() * 0.8,
          });
        }
      }
    }

    function getObstacleTipY(obstacle) {
      return obstacle.side === "top"
        ? obstacle.bodyLength + obstacle.spike
        : game.height - obstacle.bodyLength - obstacle.spike;
    }

    function getObstacleStep() {
      return OBSTACLE_WIDTH + game.obstacleSpacing;
    }

    function getFirstObstacleX() {
      return game.scrollDistance + game.width + BASE_SPEED * OBSTACLE_START_DELAY_SEC + OBSTACLE_START_OFFSET;
    }

    function appendObstacleAt(x) {
      const side = game.nextObstacleSide;
      const step = getObstacleStep();
      const centerShiftMax = Math.max(26, step - (game.player.size + PLAYER_MARGIN));
      const gapMin = game.height * 0.08;
      const gapMax = game.height * 0.08;
      const gap = rand(gapMin, gapMax);
      const halfGap = gap * 0.5;
      const tipEdge = OBSTACLE_SPIKE + 28;
      const minCenter = tipEdge + halfGap;
      const maxCenter = game.height - tipEdge - halfGap;

      let centerY = game.nextGuideCenterY ?? game.height * 0.5;
      centerY += rand(-centerShiftMax, centerShiftMax);
      centerY = clamp(centerY, minCenter, maxCenter);
      game.nextGuideCenterY = centerY;

      const tipY = side === "top"
        ? centerY - halfGap
        : centerY + halfGap;

      const bodyLength = Math.max(10,
        side === "top" ? tipY - OBSTACLE_SPIKE : game.height - tipY - OBSTACLE_SPIKE
      );

      obstacles.push({
        x,
        width: OBSTACLE_WIDTH,
        spike: OBSTACLE_SPIKE,
        side,
        bodyLength,
      });

      game.nextObstacleSide = side === "top" ? "bottom" : "top";

      return x + OBSTACLE_WIDTH + game.obstacleSpacing;
    }

    function setupObstacles() {
      obstacles = [];
      game.nextObstacleSide = "top";
      game.nextGuideCenterY = null;

      nextObstacleX = getFirstObstacleX();
      const target = game.scrollDistance + game.width + getObstacleStep() * 2;
      while (nextObstacleX < target) {
        nextObstacleX = appendObstacleAt(nextObstacleX);
      }
    }

    function maintainObstacles() {
      while (obstacles.length && obstacles[0].x + obstacles[0].width < game.scrollDistance - OBSTACLE_WIDTH) {
        obstacles.shift();
      }

      const minSpawnX = game.scrollDistance + game.width + OBSTACLE_START_OFFSET;
      if (nextObstacleX < minSpawnX) {
        nextObstacleX = minSpawnX;
      }

      const target = game.scrollDistance + game.width + getObstacleStep() * 2;
      while (nextObstacleX < target) {
        nextObstacleX = appendObstacleAt(nextObstacleX);
      }
    }

    function updateOverlay(titleHtml, buttonText, hidden) {
      if (hidden) {
        overlay.classList.add("hidden");
        return;
      }
      overlay.classList.remove("hidden");
      titleEl.innerHTML = titleHtml;
      startBtn.textContent = buttonText;
    }

    function updateHUD(dt) {
      game.displayedScore += (game.score - game.displayedScore) * clamp(dt * 14, 0, 1);
      distanceEl.textContent = String(Math.floor(game.displayedScore));
    }

    function restartBgm() {
      bgm.pause();
      bgm.currentTime = 0;
      bgm.play().catch(() => {});
    }

    function playDeathSfx() {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        return;
      }

      const sfxCtx = new AudioCtx();
      const now = sfxCtx.currentTime;
      const osc = sfxCtx.createOscillator();
      const gain = sfxCtx.createGain();

      osc.type = "triangle";
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.22);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      osc.connect(gain);
      gain.connect(sfxCtx.destination);

      osc.start(now);
      osc.stop(now + 0.25);
      osc.onended = () => {
        sfxCtx.close().catch(() => {});
      };
    }

    function spawnTrail() {
      const worldX = game.scrollDistance + game.player.x;
      const last = game.player.trail[game.player.trail.length - 1];
      if (last && Math.abs(last.worldX - worldX) < 5 && Math.abs(last.y - game.player.y) < 2) {
        return;
      }

      game.player.trail.push({
        worldX,
        y: game.player.y,
      });

      while (game.player.trail.length && game.player.trail[0].worldX < game.scrollDistance - 30) {
        game.player.trail.shift();
      }

      if (game.player.trail.length > 6000) {
        game.player.trail.shift();
      }
    }

    function isInsideTopObstacle(px, py, obstacle) {
      const tipY = obstacle.bodyLength + obstacle.spike;
      const spikeBaseY = obstacle.bodyLength;
      const left = obstacle.x;
      const right = obstacle.x + obstacle.width;

      if (py <= spikeBaseY) {
        return px >= left && px <= right;
      }

      if (py <= tipY) {
        const ratio = (tipY - py) / obstacle.spike;
        const half = (obstacle.width * 0.5) * ratio;
        const cx = obstacle.x + obstacle.width * 0.5;
        return Math.abs(px - cx) <= half;
      }

      return false;
    }

    function isInsideBottomObstacle(px, py, obstacle) {
      const tipY = game.height - obstacle.bodyLength - obstacle.spike;
      const spikeBaseY = game.height - obstacle.bodyLength;
      const left = obstacle.x;
      const right = obstacle.x + obstacle.width;

      if (py >= spikeBaseY) {
        return px >= left && px <= right;
      }

      if (py >= tipY) {
        const ratio = (py - tipY) / obstacle.spike;
        const half = (obstacle.width * 0.5) * ratio;
        const cx = obstacle.x + obstacle.width * 0.5;
        return Math.abs(px - cx) <= half;
      }

      return false;
    }

    function hitsObstacle() {
      const worldX = game.scrollDistance + game.player.x;
      const r = game.player.size * PLAYER_HITBOX_SCALE;

      if (game.player.y - r <= 0 || game.player.y + r >= game.height) {
        return true;
      }

      const samples = [
        [0, 0],
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
        [r * 0.7, r * 0.7],
        [-r * 0.7, r * 0.7],
      ];

      for (const obstacle of obstacles) {
        if (worldX + r < obstacle.x - 2 || worldX - r > obstacle.x + obstacle.width + 2) {
          continue;
        }

        for (const [ox, oy] of samples) {
          const px = worldX + ox;
          const py = game.player.y + oy;
          if (obstacle.side === "top") {
            if (isInsideTopObstacle(px, py, obstacle)) {
              return true;
            }
          } else if (isInsideBottomObstacle(px, py, obstacle)) {
            return true;
          }
        }
      }

      return false;
    }

    function updateParticles(dt) {
      for (const p of particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 320 * dt;
        p.life -= dt;
      }
      particles = particles.filter((p) => p.life > 0);
    }

    function resetRun() {
      game.running = false;
      game.dead = false;
      game.awaitingStart = true;
      game.score = 0;
      game.displayedScore = 0;
      game.scrollDistance = 0;
      game.bgTravel = 0;
      game.speed = BASE_SPEED;
      game.obstacleSpacing = OBSTACLE_SPACING;
      game.pressed = false;
      game.paused = false;
      game.countdown = 0;
      game.countdownElapsed = 0;
      game.player.y = game.height * 0.5;
      game.player.rot = 0;
      game.player.trail = [];
      particles = [];
      bgm.pause();
      bgm.currentTime = 0;

      setupObstacles();
      updateOverlay("geome<span class=\"rainbow-glow\">TERRY</span>dash", "START", false);
      updateHUD(0);
    }

    function startRun() {
      game.running = true;
      game.dead = false;
      game.awaitingStart = false;
      game.paused = false;
      game.countdown = 0;
      game.countdownElapsed = 0;
      game.pressed = false;
      game.score = 0;
      game.displayedScore = 0;
      game.scrollDistance = 0;
      game.bgTravel = 0;
      game.speed = BASE_SPEED;
      game.obstacleSpacing = OBSTACLE_SPACING;
      game.player.y = game.height * 0.5;
      game.lastTs = 0;
      game.player.trail = [];
      particles = [];
      setupObstacles();
      updateOverlay("", "", true);
      restartBgm();
    }

    function pauseRun() {
      game.running = false;
      game.paused = true;
      bgm.pause();
      updateOverlay("STOP", "CONTINUE", false);
    }

    function resumeWithCountdown() {
      game.paused = false;
      game.countdown = 3;
      game.countdownElapsed = 0;
      overlay.classList.add("hidden");
    }

    function killRun() {
      game.running = false;
      game.dead = true;
      bgm.pause();
      playDeathSfx();
      const currentScore = Math.floor(game.score);
      const isNewBest = currentScore > game.best;
      game.best = Math.max(game.best, currentScore);
      localStorage.setItem("wave-best", String(game.best));

      for (let i = 0; i < 50; i += 1) {
        particles.push({
          x: game.player.x,
          y: game.player.y,
          vx: rand(-160, 200),
          vy: rand(-220, 220),
          life: rand(0.4, 1),
          size: rand(1.4, 3.6),
        });
      }

      bestEl.textContent = `BEST SCORE ${Math.floor(game.best)}`;
      updateOverlay(
        isNewBest
          ? `<span class="rainbow-glow">NEW BEST!</span><br /><span class="best-score-line">BEST SCORE ${Math.floor(game.best)}</span>`
          : `SCORE ${currentScore}<br /><span class="best-score-line">BEST SCORE ${Math.floor(game.best)}</span>`,
        "TRY AGAIN",
        false
      );
    }

    function update(dt) {
      if (game.countdown > 0) {
        game.countdownElapsed += dt;
        if (game.countdownElapsed >= 1) {
          game.countdownElapsed -= 1;
          game.countdown -= 1;
          if (game.countdown === 0) {
            game.running = true;
            bgm.play().catch(() => {});
          }
        }
      }

      if (game.running) {
        game.bgTravel += dt;
        game.obstacleSpacing = Math.max(
          MIN_OBSTACLE_SPACING,
          game.obstacleSpacing - SPACING_SHRINK_PER_SEC * dt
        );
        game.score += dt * SCORE_RATE;
        game.scrollDistance += game.speed * dt;

        const dir = game.pressed ? -1 : 1;
        game.player.y += dir * game.speed * dt;
        game.player.rot = dir < 0 ? -Math.PI / 4 : Math.PI / 4;

        maintainObstacles();

        spawnTrail();

        if (!game.noDeathMode && hitsObstacle()) {
          killRun();
        }

        for (const s of stars) {
          s.x -= game.speed * dt * s.z * 0.18;
          if (s.x < -4) {
            s.x = game.width + rand(0, 220);
            s.y = rand(0, game.height);
          }
        }
      }

      updateParticles(dt);
      updateHUD(dt);
    }

    function drawBackground() {
      const g = ctx.createLinearGradient(0, 0, 0, game.height);
      g.addColorStop(0, "rgba(4, 10, 30, 0.3)");
      g.addColorStop(1, "rgba(2, 22, 42, 0.65)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, game.width, game.height);

      for (const s of stars) {
        ctx.fillStyle = `rgba(243, 255, 143, ${0.15 + s.z * 0.55})`;
        ctx.fillRect(s.x, s.y, s.z * 2.2, s.z * 2.2);
      }

      const score = Math.floor(game.score);
      const appearStartOffset = 140;
      const appearDuration = 260;
      const pxPerScore = 2.0;

      function stageProgress(stageScore) {
        return clamp((score - (stageScore - appearStartOffset)) / appearDuration, 0, 1);
      }

      function stageAlpha(stageScore) {
        return easeOutExpo(stageProgress(stageScore));
      }

      function stageX(stageScore, laneOffset) {
        const startScore = stageScore - appearStartOffset;
        const traveled = Math.max(0, score - startScore) * pxPerScore;
        return game.width + laneOffset - traveled;
      }

      const earthA = stageAlpha(100);
      if (earthA > 0) {
        const x = stageX(100, 60);
        const y = game.height * 0.22;
        const r = 72;
        const earthG = ctx.createRadialGradient(x - 16, y - 20, 8, x, y, r);
        earthG.addColorStop(0, "rgba(168, 242, 255, 0.98)");
        earthG.addColorStop(0.58, "rgba(70, 150, 230, 0.93)");
        earthG.addColorStop(1, "rgba(26, 62, 152, 0.88)");
        ctx.save();
        ctx.globalAlpha = earthA * 0.82;
        ctx.fillStyle = earthG;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(196, 245, 255, 0.7)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(108, 220, 140, 0.75)";
        ctx.beginPath();
        ctx.ellipse(x - 24, y + 9, 22, 15, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x + 20, y - 15, 16, 10, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const jupiterA = stageAlpha(300);
      if (jupiterA > 0) {
        const x = stageX(300, 290);
        const y = game.height * 0.66;
        const r = 96;
        const jupiterG = ctx.createRadialGradient(x - 18, y - 20, 10, x, y, r);
        jupiterG.addColorStop(0, "rgba(255, 221, 178, 0.95)");
        jupiterG.addColorStop(1, "rgba(170, 104, 64, 0.92)");
        ctx.save();
        ctx.globalAlpha = jupiterA * 0.8;
        ctx.fillStyle = jupiterG;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();

        // Jupiter stripes with clipping for smoother look.
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        const stripeG = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        stripeG.addColorStop(0, "rgba(255, 214, 166, 0.45)");
        stripeG.addColorStop(0.5, "rgba(198, 132, 90, 0.55)");
        stripeG.addColorStop(1, "rgba(143, 86, 58, 0.42)");
        ctx.fillStyle = stripeG;
        for (let i = -4; i <= 4; i += 1) {
          ctx.fillRect(x - r - 10, y + i * 18, r * 2 + 20, 8 + Math.abs(i % 2) * 2);
        }
        ctx.restore();

        ctx.fillStyle = "rgba(230, 160, 120, 0.7)";
        ctx.beginPath();
        ctx.arc(x + 28, y + 20, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(170, 84, 60, 0.55)";
        ctx.beginPath();
        ctx.ellipse(x + 36, y + 22, 16, 10, -0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 226, 190, 0.62)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const saturnA = stageAlpha(500);
      if (saturnA > 0) {
        const x = stageX(500, 520);
        const y = game.height * 0.38;
        const r = 84;
        const saturnG = ctx.createRadialGradient(x - 10, y - 15, 8, x, y, r);
        saturnG.addColorStop(0, "rgba(255, 224, 155, 0.94)");
        saturnG.addColorStop(1, "rgba(186, 136, 74, 0.9)");
        ctx.save();
        ctx.globalAlpha = saturnA * 0.8;
        ctx.strokeStyle = "rgba(229, 205, 164, 0.78)";
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.ellipse(x, y, r + 74, r * 0.56, -0.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(245, 226, 186, 0.42)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(x, y, r + 98, r * 0.72, -0.28, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = saturnG;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 230, 180, 0.42)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      const sunA = stageAlpha(750);
      if (sunA > 0) {
        const x = stageX(750, 750);
        const y = game.height * 0.78;
        const r = 116;
        const sunG = ctx.createRadialGradient(x, y, 2, x, y, r + 24);
        sunG.addColorStop(0, "rgba(255, 247, 158, 1)");
        sunG.addColorStop(0.45, "rgba(255, 203, 88, 0.95)");
        sunG.addColorStop(1, "rgba(255, 120, 40, 0)");
        ctx.save();
        ctx.globalAlpha = sunA * 0.75;
        ctx.fillStyle = sunG;
        ctx.beginPath();
        ctx.arc(x, y, r + 78, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255, 210, 90, 0.95)";
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 238, 170, 0.58)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 184, 94, 0.34)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 16; i += 1) {
          const a = i * (Math.PI * 2 / 16);
          const x1 = x + Math.cos(a) * (r + 14);
          const y1 = y + Math.sin(a) * (r + 14);
          const x2 = x + Math.cos(a) * (r + 30);
          const y2 = y + Math.sin(a) * (r + 30);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255, 170, 70, 0.35)";
        ctx.beginPath();
        ctx.arc(x + 24, y - 18, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const andromedaA = stageAlpha(1000);
      if (andromedaA > 0) {
        const x = stageX(1000, 980);
        const y = game.height * 0.16;
        ctx.save();
        ctx.globalAlpha = andromedaA * 0.8;
        const armG = ctx.createLinearGradient(x - 220, y - 80, x + 220, y + 80);
        armG.addColorStop(0, "rgba(198, 217, 255, 0.45)");
        armG.addColorStop(0.5, "rgba(153, 191, 255, 0.55)");
        armG.addColorStop(1, "rgba(116, 156, 255, 0.32)");
        ctx.strokeStyle = armG;
        ctx.lineWidth = 6;
        for (let i = 0; i < 6; i += 1) {
          ctx.beginPath();
          ctx.ellipse(x, y, 46 + i * 34, 12 + i * 10, Math.PI * 0.24, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = andromedaA * 0.38;
        ctx.fillStyle = "rgba(182, 210, 255, 0.72)";
        ctx.beginPath();
        ctx.ellipse(x, y, 250, 82, Math.PI * 0.24, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(236, 246, 255, 0.9)";
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = andromedaA * 0.85;
        ctx.fillStyle = "rgba(231, 241, 255, 0.95)";
        for (let i = 0; i < 16; i += 1) {
          const a = i * 0.42;
          const rr = 36 + i * 12;
          const px = x + Math.cos(a) * rr * 0.9;
          const py = y + Math.sin(a) * rr * 0.28;
          ctx.fillRect(px, py, 2, 2);
        }
        ctx.restore();
      }

      const tonA = stageAlpha(1250);
      if (tonA > 0) {
        const x = stageX(1250, 1210);
        const y = game.height * 0.54;
        const glow = ctx.createRadialGradient(x, y, 1, x, y, 130);
        glow.addColorStop(0, "rgba(255, 255, 255, 1)");
        glow.addColorStop(0.35, "rgba(183, 214, 255, 0.95)");
        glow.addColorStop(1, "rgba(119, 108, 255, 0)");
        ctx.save();
        ctx.globalAlpha = tonA * 0.8;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 130, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(218, 226, 255, 0.78)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(196, 206, 255, 0.8)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x - 180, y + 5);
        ctx.lineTo(x + 180, y - 5);
        ctx.stroke();
        ctx.strokeStyle = "rgba(146, 174, 255, 0.42)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - 220, y + 16);
        ctx.lineTo(x + 220, y - 16);
        ctx.stroke();
        ctx.fillStyle = "rgba(238, 246, 255, 0.86)";
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const blackHoleA = stageAlpha(1500);
      if (blackHoleA > 0) {
        const x = stageX(1500, 1440);
        const y = game.height * 0.84;
        ctx.save();
        ctx.globalAlpha = blackHoleA * 0.88;
        const lensGlow = ctx.createRadialGradient(x, y, 10, x, y, 220);
        lensGlow.addColorStop(0, "rgba(0, 0, 0, 0)");
        lensGlow.addColorStop(0.45, "rgba(107, 102, 255, 0.16)");
        lensGlow.addColorStop(1, "rgba(66, 180, 255, 0)");
        ctx.fillStyle = lensGlow;
        ctx.beginPath();
        ctx.arc(x, y, 220, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(153, 116, 255, 0.75)";
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.ellipse(x, y, 190, 56, 0.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(83, 193, 255, 0.62)";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(x, y, 210, 62, 0.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(130, 110, 255, 0.55)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x, y, 168, 48, 0.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(0, 0, 0, 0.95)";
        ctx.beginPath();
        ctx.arc(x, y, 84, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(96, 172, 255, 0.35)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 112, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "rgba(84, 136, 255, 0.28)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.arc(x, y, 124 + i * 18, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawObstacles() {
      const useScoreGradient = game.score >= SCORE_GRADIENT_OBSTACLE_SCORE;
      const useRainbowGradient = game.score >= RAINBOW_OBSTACLE_SCORE;
      const rainbowTime = performance.now() * 0.00035;
      const obstacleGradient = ctx.createLinearGradient(0, 0, 0, game.height);
      obstacleGradient.addColorStop(0, "rgba(135, 206, 235, 0.95)");
      obstacleGradient.addColorStop(0.5, "rgba(59, 130, 246, 0.95)");
      obstacleGradient.addColorStop(1, "rgba(139, 92, 246, 0.95)");

      for (const obstacle of obstacles) {
        const sx = obstacle.x - game.scrollDistance;
        if (sx + obstacle.width < -40 || sx > game.width + 40) {
          continue;
        }

        let fillStyle = "rgba(8, 24, 46, 0.96)";
        let strokeStyle = "rgba(110, 210, 255, 0.92)";

        if (useRainbowGradient) {
          // Time and position based phase makes the rainbow look like it is flowing.
          const phase = (rainbowTime + sx * 0.0025) % 1;
          const obstacleGradient = ctx.createLinearGradient(
            sx,
            -game.height * 0.2,
            sx + obstacle.width,
            game.height * 1.2
          );

          for (let i = 0; i <= 6; i += 1) {
            const stop = i / 6;
            const hue = ((phase + stop) % 1) * 360;
            obstacleGradient.addColorStop(stop, `hsla(${hue}, 92%, 62%, 0.98)`);
          }

          fillStyle = obstacleGradient;
          strokeStyle = obstacleGradient;
        } else if (useScoreGradient) {
          fillStyle = obstacleGradient;
          strokeStyle = obstacleGradient;
        }

        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 3;

        if (obstacle.side === "top") {
          const bodyH = obstacle.bodyLength;
          const tipY = bodyH + obstacle.spike;

          ctx.fillRect(sx, 0, obstacle.width, bodyH);
          ctx.beginPath();
          ctx.moveTo(sx, bodyH);
          ctx.lineTo(sx + obstacle.width, bodyH);
          ctx.lineTo(sx + obstacle.width * 0.5, tipY);
          ctx.closePath();
          ctx.fill();

          ctx.strokeRect(sx, 0, obstacle.width, bodyH);
          ctx.beginPath();
          ctx.moveTo(sx, bodyH);
          ctx.lineTo(sx + obstacle.width * 0.5, tipY);
          ctx.lineTo(sx + obstacle.width, bodyH);
          ctx.stroke();
        } else {
          const bodyY = game.height - obstacle.bodyLength;
          const tipY = bodyY - obstacle.spike;

          ctx.fillRect(sx, bodyY, obstacle.width, obstacle.bodyLength);
          ctx.beginPath();
          ctx.moveTo(sx, bodyY);
          ctx.lineTo(sx + obstacle.width, bodyY);
          ctx.lineTo(sx + obstacle.width * 0.5, tipY);
          ctx.closePath();
          ctx.fill();

          ctx.strokeRect(sx, bodyY, obstacle.width, obstacle.bodyLength);
          ctx.beginPath();
          ctx.moveTo(sx, bodyY);
          ctx.lineTo(sx + obstacle.width * 0.5, tipY);
          ctx.lineTo(sx + obstacle.width, bodyY);
          ctx.stroke();
        }
      }
    }

    function drawTrail() {
      if (game.player.trail.length < 2) {
        return;
      }

      const trailWidth = game.player.size * 2.7 * 0.6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();

      let started = false;
      for (const point of game.player.trail) {
        const sx = point.worldX - game.scrollDistance;
        if (sx < -40 || sx > game.width + 40) {
          continue;
        }

        if (!started) {
          ctx.moveTo(sx, point.y);
          started = true;
        } else {
          ctx.lineTo(sx, point.y);
        }
      }

      if (started) {
        ctx.strokeStyle = "rgba(165, 165, 195, 0.84)";
        ctx.lineWidth = trailWidth;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
    }

    function drawPlayer() {
      const spriteSize = game.player.size * 2.7;

      ctx.save();
      ctx.translate(game.player.x, game.player.y);
      ctx.rotate(game.player.rot);
      ctx.shadowBlur = 0;

      if (waveSprite.complete && waveSprite.naturalWidth > 0) {
        ctx.drawImage(waveSprite, -spriteSize * 0.5, -spriteSize * 0.5, spriteSize, spriteSize);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, game.player.size, 0, Math.PI * 2);
        ctx.fillStyle = "#5cb8ff";
        ctx.fill();
      }

      ctx.restore();
    }

    function drawParticles() {
      for (const p of particles) {
        ctx.fillStyle = `rgba(255, 106, 61, ${p.life})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }

    function drawPulseFrame() {
      const t = (performance.now() * 0.00022) % 1;
      const eased = easeOutExpo(t);
      ctx.strokeStyle = `rgba(243, 255, 143, ${0.12 - eased * 0.1})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(6, 6, game.width - 12, game.height - 12);
    }

    function render() {
      ctx.clearRect(0, 0, game.width, game.height);
      drawBackground();
      drawObstacles();
      drawTrail();
      drawPlayer();
      drawParticles();

      if (game.countdown > 0) {
        const alpha = 1 - game.countdownElapsed;
        const scale = 1.4 - game.countdownElapsed * 0.4;
        const fontSize = Math.round(130 * scale);
        ctx.save();
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.shadowColor = "rgba(100, 200, 255, 0.9)";
        ctx.shadowBlur = 30;
        ctx.fillText(String(game.countdown), game.width / 2, game.height / 2);
        ctx.restore();
      }

      drawPulseFrame();
    }

    function loop(ts) {
      if (!game.lastTs) {
        game.lastTs = ts;
      }

      const dt = Math.min(0.033, (ts - game.lastTs) / 1000);
      game.lastTs = ts;

      update(dt);
      render();

      game.rafId = requestAnimationFrame(loop);
    }

    function setPressed(value) {
      if (!game.running) {
        game.pressed = false;
        return;
      }
      game.pressed = value;
    }

    function onKeyDown(e) {
      const isFlyKey = e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW";

      if (e.code === "KeyN") {
        game.noDeathMode = !game.noDeathMode;
        return;
      }

      if (e.code === "Escape") {
        if (game.running) {
          e.preventDefault();
          pauseRun();
        }
        return;
      }

      if (game.paused) {
        if (e.code === "Space") {
          e.preventDefault();
          resumeWithCountdown();
        }
        return;
      }

      if (game.countdown > 0) {
        return;
      }

      if (game.dead) {
        if (e.code === "Space") {
          e.preventDefault();
          startRun();
          game.pressed = true;
        }
        return;
      }

      if (game.awaitingStart && e.code === "Space") {
        e.preventDefault();
        startRun();
        game.pressed = true;
        return;
      }

      if (isFlyKey) {
        e.preventDefault();
        setPressed(true);
      }
    }

    function onKeyUp(e) {
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
        setPressed(false);
      }
    }

    function onPointerDown(e) {
      e.preventDefault();
      setPressed(true);
    }

    function onPointerUp() {
      setPressed(false);
    }

    function onStartClick() {
      if (game.paused) {
        resumeWithCountdown();
      } else {
        startRun();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", resize);
    startBtn.addEventListener("click", onStartClick);

    resize();
    resetRun();
    game.rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(game.rafId);
      bgm.pause();
      bgm.src = "";
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", resize);
      startBtn.removeEventListener("click", onStartClick);
    };
  }, []);

  return (
    <main className="app">
      <header className="hud top">
        <div className="brand">
          <span>geome</span>
          <span className="rainbow-glow">TERRY</span>
          <span>dash</span>
        </div>
      </header>

      <section className="game-shell">
        <canvas ref={canvasRef} aria-label="Wave game canvas" />

        <div className="hud score">
          <div className="score-label">SCORE</div>
          <div className="score-value" ref={distanceRef}>
            0
          </div>
          <div className="best" ref={bestRef}>
            BEST 0
          </div>
        </div>

        <div className="overlay" ref={overlayRef}>
          <h1 ref={titleRef}>
            geome<span className="rainbow-glow">TERRY</span>dash
          </h1>
          <button ref={startBtnRef}>START</button>
        </div>
      </section>
    </main>
  );
}
