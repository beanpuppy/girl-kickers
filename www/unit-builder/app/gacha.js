let gachaActive = false;
let gachaPulls = [];
let gachaPullIndex = 0;

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function isGachaDev() {
  return new URLSearchParams(window.location.search).has("gachadev");
}

function isGachaLocked() {
  if (isGachaDev()) return false;
  return localStorage.getItem("gachaLastPull") === todayUTC();
}

let gachaCountdownInterval = null;

function timeUntilMidnightUTC() {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  const diff = midnight - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function updateGachaBtn() {
  const btn = document.getElementById("gachaBtn");
  const label = document.getElementById("gachaBtnLabel");
  if (!btn || !label) return;
  if (isGachaLocked()) {
    btn.classList.add("locked");
    label.textContent = timeUntilMidnightUTC();
    btn.title = "Come back tomorrow!";
    // Start countdown ticker
    if (!gachaCountdownInterval) {
      gachaCountdownInterval = setInterval(() => {
        if (!isGachaLocked()) {
          clearInterval(gachaCountdownInterval);
          gachaCountdownInterval = null;
          updateGachaBtn();
          return;
        }
        label.textContent = timeUntilMidnightUTC();
      }, 60000);
    }
  } else {
    btn.classList.remove("locked");
    label.textContent = "Daily Gacha";
    btn.title = "Daily Gacha";
    if (gachaCountdownInterval) {
      clearInterval(gachaCountdownInterval);
      gachaCountdownInterval = null;
    }
  }
}

function saveGachaPulls() {
  const data = {
    date: todayUTC(),
    pullIndex: gachaPullIndex,
    pulls: gachaPulls.map((p) => ({
      dollId: p.doll.id,
      grade: p.grade,
      gradeColour: p.gradeColour,
      boosts: p.boosts,
      boostedStats: p.boostedStats,
      dupeCount: p.dupeCount,
      dupeBonus: p.dupeBonus,
      bonusWeapons: p.bonusWeapons || [],
    })),
  };
  localStorage.setItem("gachaPulls", JSON.stringify(data));
}

function loadGachaPulls() {
  try {
    const raw = localStorage.getItem("gachaPulls");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.date || data.date !== todayUTC()) {
      clearGachaPulls();
      return null;
    }
    const pulls = data.pulls;
    if (!Array.isArray(pulls) || pulls.length === 0) return null;
    const restored = pulls
      .map((p) => {
        const doll = allDolls.find((d) => d.id === p.dollId);
        if (!doll) return null;
        return {
          doll,
          grade: p.grade,
          gradeColour: p.gradeColour,
          boosts: p.boosts,
          boostedStats: p.boostedStats,
          dupeCount: p.dupeCount,
          dupeBonus: p.dupeBonus || 0,
          bonusWeapons: p.bonusWeapons || [],
        };
      })
      .filter(Boolean);
    return {
      pulls: restored,
      pullIndex: data.pullIndex || restored.length,
    };
  } catch {
    return null;
  }
}

function clearGachaPulls() {
  localStorage.removeItem("gachaPulls");
}

function startGacha() {
  const overlay = document.getElementById("gachaOverlay");
  const main = document.getElementById("gachaMain");
  const summary = document.getElementById("gachaSummary");
  let lockedMsg = document.getElementById("gachaLockedMsg");

  const saved = loadGachaPulls();

  if (isGachaLocked() || (!isGachaLocked() && saved && saved.pullIndex >= 8)) {
    if (saved && saved.pullIndex >= 8) {
      gachaPulls = saved.pulls;
      gachaPullIndex = 8;
      gachaActive = false;
      main.style.display = "none";
      if (lockedMsg) lockedMsg.style.display = "none";
      overlay.classList.add("visible");
      document.body.classList.add("modal-open");
      showGachaSummary();
      return;
    }

    // Truly locked, no saved pulls
    main.style.display = "none";
    summary.style.display = "none";
    if (!lockedMsg) {
      lockedMsg = document.createElement("div");
      lockedMsg.id = "gachaLockedMsg";
      lockedMsg.className = "gacha-locked-msg";
      overlay.appendChild(lockedMsg);
    }
    lockedMsg.style.display = "block";
    lockedMsg.innerHTML = `
            <strong>Come back tomorrow!</strong>
            <p>You've already pulled today. Gacha resets at midnight UTC.</p>
            <div class="gacha-actions" style="margin-top:20px">
                <button class="btn" onclick="closeGacha()">Close</button>
            </div>
        `;
    overlay.classList.add("visible");
    document.body.classList.add("modal-open");
    return;
  }

  gachaActive = true;
  gachaPulls = [];
  gachaPullIndex = 0;

  if (lockedMsg) lockedMsg.style.display = "none";
  main.style.display = "block";
  summary.style.display = "none";
  overlay.classList.add("visible");
  document.body.classList.add("modal-open");

  clearGachaPulls();
  const intro = document.getElementById("gachaIntro");
  if (intro) intro.classList.remove("hidden");
  const roster = document.getElementById("gachaRoster");
  if (roster) roster.style.display = "none";
  const cascade = document.getElementById("gachaCascade");
  if (cascade) cascade.style.display = "none";
  renderGachaPity();

  // Show pull button
  document.getElementById("gachaActions").innerHTML = `
        <button class="btn btn-accent" onclick="doCascadePull()">Pull</button>
    `;
}

function closeGacha() {
  gachaActive = false;
  document.getElementById("gachaOverlay").classList.remove("visible");
  document.body.classList.remove("modal-open");
}

function restartGacha() {
  clearGachaPulls();
  localStorage.removeItem("gachaLastPull");
  gachaPulls = [];
  gachaPullIndex = 0;
  document.getElementById("gachaSummary").style.display = "none";
  document.getElementById("gachaMain").style.display = "block";
  const intro = document.getElementById("gachaIntro");
  if (intro) intro.classList.remove("hidden");
  const roster = document.getElementById("gachaRoster");
  if (roster) roster.style.display = "none";
  const cascade = document.getElementById("gachaCascade");
  if (cascade) cascade.style.display = "none";
  renderGachaPity();
  document.getElementById("gachaActions").innerHTML = `
        <button class="btn btn-accent" onclick="doCascadePull()">Pull</button>
    `;
}

let gachaAnimateSlot = -1; // index to animate, -1 = none
let gachaAnimateType = ""; // "pop" or "merge"

function renderGachaRoster() {
  const roster = document.getElementById("gachaRoster");
  let html = "";
  for (let i = 0; i < gachaPulls.length; i++) {
    const pull = gachaPulls[i];
    const anim = i === gachaAnimateSlot ? gachaAnimateType : "";
    const vLabel =
      pull.dupeCount > 0
        ? `<div class="gacha-roster-version">V${pull.dupeCount + 1}</div>`
        : "";
    html += `<div class="gacha-roster-slot filled ${anim}" data-grade="${pull.grade}" data-pull-idx="${i}">
            ${pull.doll.portrait ? `<img src="${esc(pull.doll.portrait)}" alt="${esc(pull.doll.name)}" />` : ""}
            ${vLabel}
        </div>`;
  }
  roster.innerHTML = html;
}

function renderGachaPity(animate) {
  const el = document.getElementById("gachaPityDisplay");
  if (!el) return;
  const count = getLegendaryPityCount();
  const max = PITY_THRESHOLDS.SSR;
  const remaining = Math.max(max - count, 0);
  const pct = Math.min((count / max) * 100, 100);

  // If animating, start from old width and transition to new
  const existingFill = el.querySelector(".gacha-pity-fill");
  const oldWidth = existingFill ? existingFill.style.width : "0%";

  el.innerHTML = `
        <span class="gacha-pity-label">Guaranteed SSR</span>
        <div class="gacha-pity-bar"><div class="gacha-pity-fill" style="width:${animate ? oldWidth : pct + "%"}"></div></div>
        <span>${remaining} pulls</span>
    `;

  if (animate) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const fill = el.querySelector(".gacha-pity-fill");
        if (fill) fill.style.width = pct + "%";
      });
    });
  }
}

const GRADE_COLOURS = {
  common: "#8a8a8a",
  Rare: "#4f8ff5",
  SR: "#c24fdb",
  SSR: "#e8b630",
};

// Fake grade border pool — weighted so rares/SSRs feel common
const gradePool = [
  { colour: "#8a8a8a", weight: 3 },
  { colour: "#4f8ff5", weight: 4 },
  { colour: "#c24fdb", weight: 3 },
  { colour: "#e8b630", weight: 2 },
];
const weightedGrades = gradePool.flatMap((g) => Array(g.weight).fill(g));
function randomFakeGrade() {
  return weightedGrades[Math.floor(Math.random() * weightedGrades.length)];
}

// When set, pity functions use this instead of localStorage
let _pityOverride = null;

function preRollAllPulls() {
  const results = [];
  // Simulate pity locally so guarantees work across 8 pulls
  // without writing to localStorage (that happens per-reveal)
  _pityOverride = loadPity();

  for (let i = 0; i < 8; i++) {
    const winner = allDolls[Math.floor(Math.random() * allDolls.length)];
    const priorDupe = results.filter((r) => r.doll.id === winner.id).length;
    const existingDupe = results.find((r) => r.doll.id === winner.id);
    const dupeCount = priorDupe;
    const rolled = randomiseStats(winner, dupeCount);

    // Update sim pity (not localStorage)
    _pityOverride.Rare++;
    _pityOverride.SR++;
    _pityOverride.SSR++;
    const gradeOrder = ["common", "Rare", "SR", "SSR"];
    const achieved = gradeOrder.indexOf(rolled.grade);
    if (achieved >= 1) _pityOverride.Rare = 0;
    if (achieved >= 2) _pityOverride.SR = 0;
    if (achieved >= 3) _pityOverride.SSR = 0;

    results.push({
      doll: winner,
      ...rolled,
      dupeCount: priorDupe,
      dupeOfIndex: existingDupe ? results.indexOf(existingDupe) : -1,
      bonusWeapon: priorDupe > 0 ? pickBonusWeapon(winner) : null,
    });
  }

  _pityOverride = null;
  return results;
}

function buildCascadeStrips(results) {
  const cascade = document.getElementById("gachaCascade");
  cascade.innerHTML = "";
  cascade.style.display = "";

  const cellWidth = 66; // 62px + 4px gap
  const cellCount = 35;
  const winnerIdx = 26;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const row = document.createElement("div");
    row.className = "gacha-cascade-row waiting";
    row.dataset.rowIndex = i;

    // Build strip
    const strip = document.createElement("div");
    strip.className = "gacha-cascade-strip";
    strip.style.transform = "translateX(0)";

    for (let c = 0; c < cellCount; c++) {
      const doll =
        c === winnerIdx
          ? result.doll
          : allDolls[Math.floor(Math.random() * allDolls.length)];
      const borderColour =
        c === winnerIdx
          ? GRADE_COLOURS[result.grade]
          : randomFakeGrade().colour;
      const cell = document.createElement("div");
      cell.className = "gacha-cascade-cell";
      cell.style.borderColor = borderColour;
      // Mark the winner cell for glow application after landing
      if (c === winnerIdx) {
        cell.dataset.winner = "true";
      }
      if (doll.portrait) {
        cell.innerHTML = `<img src="${esc(doll.portrait)}" alt="${esc(doll.name)}" />`;
      }
      strip.appendChild(cell);
    }

    // Wrap strip in clip container so cells don't overflow,
    // but glow box-shadows on the row remain visible
    const clipContainer = document.createElement("div");
    clipContainer.className = "gacha-cascade-row-clip";
    clipContainer.appendChild(strip);

    // Marker
    const marker = document.createElement("div");
    marker.className = "gacha-cascade-marker";

    // Label (hidden until landed)
    const label = document.createElement("div");
    label.className = "gacha-cascade-label";
    let dupeLabel = "";
    if (result.dupeCount > 0) {
      const weaponName = result.bonusWeapon
        ? ` + ${esc(result.bonusWeapon.name)}`
        : "";
      dupeLabel = `<span class="gacha-cascade-label-dupe">V${result.dupeCount + 1}${weaponName}</span>`;
    }
    label.innerHTML = `
            <span class="gacha-cascade-label-name">${esc(result.doll.name)}</span>
            <span class="gacha-cascade-label-grade" style="color:${result.gradeColour}">${result.grade}</span>
            ${dupeLabel}
        `;

    row.appendChild(clipContainer);
    row.appendChild(marker);
    row.appendChild(label);
    row._winnerIdx = winnerIdx;
    row._cellWidth = cellWidth;
    cascade.appendChild(row);
  }
}

function spinCascadeRow(rowIndex, duration, grade) {
  return new Promise((resolve) => {
    const row = document.querySelectorAll(".gacha-cascade-row")[rowIndex];
    if (!row) return resolve();
    const strip = row.querySelector(".gacha-cascade-strip");
    const winnerIdx = row._winnerIdx;
    const cellWidth = row._cellWidth;
    const rowWidth = row.offsetWidth;
    const winnerCell = strip.children[winnerIdx];

    row.classList.remove("waiting");
    row.classList.add("spinning");

    const targetX = -(winnerIdx * cellWidth) + rowWidth / 2 - cellWidth / 2;
    const startTime = performance.now();
    let lastCellIdx = -1;

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function animate(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(t);
      const x = targetX * eased;
      strip.style.transform = `translateX(${x}px)`;

      const cellIdx = Math.floor(Math.abs(x) / cellWidth);
      if (cellIdx !== lastCellIdx) {
        lastCellIdx = cellIdx;
        playGachaTick(t);
      }

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    }

    requestAnimationFrame(animate);
  });
}

function processCascadeResult(result, rowIndex) {
  const row = document.querySelectorAll(".gacha-cascade-row")[rowIndex];
  row.classList.remove("spinning");
  row.classList.add("landed");
  row.dataset.grade = result.grade;

  // Apply glow to winner cell now that it's landed
  if (result.grade !== "common") {
    const winnerCell = row.querySelector('[data-winner="true"]');
    if (winnerCell) winnerCell.classList.add("glow-" + result.grade);
  }

  // Reveal label
  const label = row.querySelector(".gacha-cascade-label");
  if (label) label.classList.add("revealed");

  // SSR particles on the winner cell
  if (result.grade === "SSR") {
    const winnerCell = row.querySelector('[data-winner="true"]');
    if (winnerCell) {
      for (let s = 0; s < 12; s++) {
        setTimeout(() => {
          const p = document.createElement("div");
          p.className = "gacha-cell-particle";
          const angle = Math.random() * Math.PI * 2;
          const dist = 20 + Math.random() * 40;
          p.style.setProperty("--dx", Math.cos(angle) * dist + "px");
          p.style.setProperty("--dy", Math.sin(angle) * dist + "px");
          p.style.left = Math.random() * 100 + "%";
          p.style.top = Math.random() * 100 + "%";
          winnerCell.appendChild(p);
          setTimeout(() => p.remove(), 900);
        }, s * 60);
      }
    }
  }

  // Update pulls state
  const existing = gachaPulls.find((p) => p.doll.id === result.doll.id);
  if (existing) {
    existing.dupeCount++;
    const existingTotal =
      Object.values(existing.boosts).reduce((s, b) => s + b, 0) * 100;
    if (result.totalPct >= existingTotal) {
      existing.boosts = result.boosts;
      existing.boostedStats = result.boostedStats;
      existing.grade = result.grade;
      existing.gradeColour = result.gradeColour;
      existing.dupeBonus = result.dupeBonus;
    }
    if (result.bonusWeapon) {
      if (!existing.bonusWeapons) existing.bonusWeapons = [];
      existing.bonusWeapons.push(result.bonusWeapon);
    }
    gachaAnimateSlot = gachaPulls.indexOf(existing);
    gachaAnimateType = "merge";
  } else {
    const pull = {
      doll: result.doll,
      grade: result.grade,
      gradeColour: result.gradeColour,
      boosts: result.boosts,
      boostedStats: result.boostedStats,
      dupeCount: 0,
      dupeBonus: result.dupeBonus,
      bonusWeapons: result.bonusWeapon ? [result.bonusWeapon] : [],
    };
    gachaPulls.push(pull);
    gachaAnimateSlot = gachaPulls.length - 1;
    gachaAnimateType = "pop";
  }
  gachaPullIndex++;
  updatePity(result.grade);
  renderGachaPity(true);
  playGachaReveal(result.grade);
  renderGachaRoster();
  gachaAnimateSlot = -1;
  gachaAnimateType = "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function animateCascade(results) {
  const SPIN_DURATION = 2500;
  const STAGGER = 1300;

  // Start all spins with stagger, overlapping
  const spinPromises = results.map((result, i) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        spinCascadeRow(i, SPIN_DURATION, result.grade).then(() => {
          processCascadeResult(result, i);
          resolve();
        });
      }, i * STAGGER);
    });
  });

  await Promise.all(spinPromises);

  // Save final state
  saveGachaPulls();

  // Show continue button
  document.getElementById("gachaActions").innerHTML = `
        <button class="btn btn-accent" onclick="showGachaSummary()">View Results</button>
    `;
}

function doCascadePull() {
  // Lock the daily pull
  localStorage.setItem("gachaLastPull", todayUTC());
  updateGachaBtn();

  // Hide intro, show roster and cascade
  const intro = document.getElementById("gachaIntro");
  if (intro) intro.classList.add("hidden");
  const roster = document.getElementById("gachaRoster");
  if (roster) roster.style.display = "";

  // Clear actions
  document.getElementById("gachaActions").innerHTML = "";

  // Play start sound
  playGachaPull();

  // Pre-roll all 8 and build strips
  const results = preRollAllPulls();
  buildCascadeStrips(results);

  // Save all results immediately for crash recovery
  const tempPulls = [];
  for (const r of results) {
    const existing = tempPulls.find((p) => p.doll.id === r.doll.id);
    if (existing) {
      existing.dupeCount++;
      const existingTotal =
        Object.values(existing.boosts).reduce((s, b) => s + b, 0) * 100;
      if (r.totalPct >= existingTotal) {
        existing.boosts = r.boosts;
        existing.boostedStats = r.boostedStats;
        existing.grade = r.grade;
        existing.gradeColour = r.gradeColour;
        existing.dupeBonus = r.dupeBonus;
      }
      if (r.bonusWeapon) {
        if (!existing.bonusWeapons) existing.bonusWeapons = [];
        existing.bonusWeapons.push(r.bonusWeapon);
      }
    } else {
      tempPulls.push({
        doll: r.doll,
        grade: r.grade,
        gradeColour: r.gradeColour,
        boosts: r.boosts,
        boostedStats: r.boostedStats,
        dupeCount: 0,
        dupeBonus: r.dupeBonus,
        bonusWeapons: r.bonusWeapon ? [r.bonusWeapon] : [],
      });
    }
  }
  // Save crash recovery state (pullIndex=8 so resume shows summary)
  const crashData = {
    date: todayUTC(),
    pullIndex: 8,
    pulls: tempPulls.map((p) => ({
      dollId: p.doll.id,
      grade: p.grade,
      gradeColour: p.gradeColour,
      boosts: p.boosts,
      boostedStats: p.boostedStats,
      dupeCount: p.dupeCount,
      dupeBonus: p.dupeBonus,
      bonusWeapons: p.bonusWeapons || [],
    })),
  };
  localStorage.setItem("gachaPulls", JSON.stringify(crashData));

  // Reset visual state and start cascade
  gachaPulls = [];
  gachaPullIndex = 0;
  renderGachaRoster();

  animateCascade(results);
}

const GACHA_GRADES = [
  { name: "SSR", colour: "#e8b630", min: 100, dupeBonus: 0.25 },
  { name: "SR", colour: "#c24fdb", min: 60, dupeBonus: 0.15 },
  { name: "Rare", colour: "#4f8ff5", min: 25, dupeBonus: 0.1 },
  {
    name: "common",
    colour: "#8a8a8a",
    min: -Infinity,
    dupeBonus: 0.05,
  },
];

// ── Pity system ──
// Counters track pulls since last grade. Persist across sessions.
const PITY_THRESHOLDS = { Rare: 3, SR: 6, SSR: 24 };

function loadPity() {
  try {
    const p = JSON.parse(localStorage.getItem("gachaPity")) || {};
    return {
      Rare: p.Rare || 0,
      SR: p.SR || 0,
      SSR: p.SSR || 0,
    };
  } catch {
    return { Rare: 0, SR: 0, SSR: 0 };
  }
}

function savePity(pity) {
  localStorage.setItem("gachaPity", JSON.stringify(pity));
}

function getPityGuarantee() {
  const pity = _pityOverride || loadPity();
  // Check from highest to lowest
  if (pity.SSR + 1 >= PITY_THRESHOLDS.SSR) return "SSR";
  if (pity.SR + 1 >= PITY_THRESHOLDS.SR) return "SR";
  if (pity.Rare + 1 >= PITY_THRESHOLDS.Rare) return "Rare";
  return null;
}

function updatePity(grade) {
  const pity = loadPity();
  // Increment all counters
  pity.Rare++;
  pity.SR++;
  pity.SSR++;
  // Reset counters for the achieved grade and below
  const gradeOrder = ["common", "Rare", "SR", "SSR"];
  const achieved = gradeOrder.indexOf(grade);
  if (achieved >= 1) pity.Rare = 0;
  if (achieved >= 2) pity.SR = 0;
  if (achieved >= 3) pity.SSR = 0;
  savePity(pity);
}

function getLegendaryPityCount() {
  return loadPity().SSR;
}

function randomiseStats(doll, dupeCount) {
  const stats = [
    "health",
    "moveSpeed",
    "turnSpeed",
    "suppressionRecovery",
    "fovDegrees",
  ];
  const boosts = {};

  // Check pity guarantee
  const pityGuarantee = getPityGuarantee();

  for (const stat of stats) {
    const raw = (Math.random() + Math.random() + Math.random()) / 3;
    const skewed = Math.pow(raw, 1.08);
    boosts[stat] = (skewed - 0.5) * 2 * 0.5; // -0.5 to +0.5
  }

  // If pity guarantees a grade, ensure total meets the threshold
  if (pityGuarantee) {
    const targetMin = GACHA_GRADES.find((g) => g.name === pityGuarantee).min;
    const currentTotal = Object.values(boosts).reduce((s, b) => s + b, 0) * 100;
    if (currentTotal < targetMin) {
      // Distribute the deficit evenly across stats with some randomness
      const deficit = (targetMin - currentTotal) / 100;
      for (const stat of stats) {
        boosts[stat] += deficit / stats.length + Math.random() * 0.04;
      }
    }
  }

  // Determine base grade (before dupe bonus)
  const basePct = Object.values(boosts).reduce((s, b) => s + b, 0) * 100;
  const gradeInfo = GACHA_GRADES.find((g) => basePct >= g.min);

  // Apply grade-based dupe bonus per stat
  if (dupeCount > 0) {
    const bonus = gradeInfo.dupeBonus * dupeCount;
    for (const stat of stats) {
      boosts[stat] += bonus;
    }
  }

  // Final grade (dupe bonuses can push grade up)
  const totalPct = Object.values(boosts).reduce((s, b) => s + b, 0) * 100;
  const finalGrade = GACHA_GRADES.find((g) => totalPct >= g.min);

  // Apply boosts to base stats
  const e = doll.entity;
  const boostedStats = {};
  for (const stat of stats) {
    const base = parseFloat(e[stat]) || 0;
    boostedStats[stat] = Math.round(base * (1 + boosts[stat]) * 100) / 100;
  }

  return {
    boosts,
    boostedStats,
    grade: finalGrade.name,
    gradeColour: finalGrade.colour,
    totalPct,
    dupeBonus: gradeInfo.dupeBonus,
  };
}

function pickBonusWeapon(doll) {
  const otherDolls = allDolls.filter((d) => d.id !== doll.id && d.weapon);
  if (otherDolls.length === 0) return null;
  const donor = otherDolls[Math.floor(Math.random() * otherDolls.length)];
  // Find the weapon equipment item from the donor
  const weaponItem =
    donor.entity.equipment.find(
      (e) =>
        e.startsWith("GFL_WPN_") ||
        e.startsWith("GFL_WEAPON_") ||
        e.includes("_WPN_") ||
        e.includes("WEAPON"),
    ) || donor.entity.equipment[0];
  return {
    name: donor.weapon.name,
    itemId: weaponItem,
    donorName: donor.name,
  };
}

function showGachaSummary() {
  document.getElementById("gachaMain").style.display = "none";
  const summary = document.getElementById("gachaSummary");
  summary.style.display = "block";

  const statNames = {
    health: "HP",
    moveSpeed: "Spd",
    turnSpeed: "Trn",
    suppressionRecovery: "Sup",
    fovDegrees: "FOV",
  };
  const cardsHtml = gachaPulls
    .map((p, i) => {
      let dupeLabel = "";
      if (p.dupeCount > 0) {
        const weaponNames = (p.bonusWeapons || [])
          .map((w) => esc(w.name))
          .join(", ");
        dupeLabel = ` <span class="mini-dupe">V${p.dupeCount + 1}${weaponNames ? " + " + weaponNames : ""}</span>`;
      }
      const statsHtml = Object.entries(p.boosts)
        .map(([stat, boost]) => {
          const pct = Math.round(boost * 100);
          const cls = pct >= 0 ? "positive" : "negative";
          const barWidth = Math.min(Math.abs(pct), 50);
          return `<div class="mini-stat ${cls}"><span class="mini-stat-label">${statNames[stat]}</span><div class="mini-stat-bar"><div class="mini-stat-bar-centre"></div><div class="mini-stat-bar-fill ${cls}" style="width:${barWidth}%"></div></div><span class="mini-stat-value">${pct >= 0 ? "+" : ""}${pct}%</span></div>`;
        })
        .join("");
      return `<div class="gacha-mini-card" data-grade="${p.grade}">
            <div class="mini-portrait">
                ${p.doll.portrait ? `<img src="${esc(p.doll.portrait)}" alt="${esc(p.doll.name)}" />` : ""}
                <div class="mini-stats-overlay">${statsHtml}</div>
            </div>
            <div class="mini-name">${esc(p.doll.name)}</div>
            <div class="mini-grade" style="color:${p.gradeColour}">${p.grade}${dupeLabel}</div>
        </div>`;
    })
    .join("");

  summary.innerHTML = `
        <h2>Gacha Results</h2>
        <div class="gacha-summary-grid">${cardsHtml}</div>
        <div class="gacha-summary-form">
            <div class="modal-field">
                <label for="gachaUnitName">Unit Name <span style="color:var(--accent)">*</span></label>
                <div style="display:flex;gap:6px">
                    <input type="text" id="gachaUnitName" placeholder="Unit name" value="${esc(randomUnitName())}" style="flex:1" />
                    <button class="btn" onclick="document.getElementById('gachaUnitName').value=randomUnitName()" title="Randomise" style="padding:8px 10px;display:flex;align-items:center">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="14" height="14" rx="1.5" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="5" r="1.2" fill="currentColor"/><circle cx="11" cy="5" r="1.2" fill="currentColor"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="5" cy="11" r="1.2" fill="currentColor"/><circle cx="11" cy="11" r="1.2" fill="currentColor"/></svg>
                    </button>
                </div>
            </div>
            <div class="modal-field">
                <label for="gachaFlagColour">Flag Colour</label>
                <div class="colour-preview-row">
                    <div class="colour-preview-wrapper" onclick="document.getElementById('gachaFlagColour').click()">
                        <input type="color" id="gachaFlagColour" value="#e3f6fd" />
                        <div class="colour-preview-bar" id="gachaColourPreviewBar"></div>
                    </div>
                    <span class="colour-hex" id="gachaColourHex">#E3F6FD</span>
                </div>
                <div class="colour-swatches" id="gachaColourSwatches"></div>
            </div>
            <div class="modal-field">
                <label for="gachaAuthor">Author <span style="color:var(--text-muted);font-weight:400;font-size:11px;text-transform:none;letter-spacing:0">optional</span></label>
                <input type="text" id="gachaAuthor" placeholder="Unit Builder" value="" />
            </div>
            <div class="modal-field">
                <label for="gachaDesc">Description <span style="color:var(--text-muted);font-weight:400;font-size:11px;text-transform:none;letter-spacing:0">optional</span></label>
                <input type="text" id="gachaDesc" placeholder="Gacha unit generated by the GFL2:DK Unit Builder." value="" />
            </div>
        </div>
        <div class="note" style="font-size:13px;color:var(--accent);background:rgba(212,133,59,0.06);border-left:2px solid var(--accent);padding:10px 14px;margin-bottom:20px;line-height:1.5">
            The base Girls' Frontline 2: Door Kickers mod is required for this add-on to work.
        </div>
        <div class="gacha-actions">
            <button class="btn" onclick="closeGacha()">Close</button>
            ${isGachaDev() ? '<button class="btn" onclick="restartGacha()">Reroll</button>' : ""}
            <button class="btn btn-accent" id="gachaDownloadBtn" onclick="doGachaDownload()">Download</button>
        </div>
    `;

  initColourSwatches(
    "gachaFlagColour",
    "gachaColourPreviewBar",
    "gachaColourHex",
    "gachaColourSwatches",
  );
}

function doGachaDownload() {
  // Write gacha pulls into unitDolls and dollOverrides
  const savedUnitDolls = [...unitDolls];
  const savedOverrides = { ...dollOverrides };

  unitDolls = gachaPulls.map((p) => p.doll.id);
  dollOverrides = {};

  // Build overrides from gacha boosted stats + bonus weapons
  const extraEquipment = {}; // dollId -> [itemId, ...]
  for (const pull of gachaPulls) {
    dollOverrides[pull.doll.id] = {
      health: String(Math.round(pull.boostedStats.health)),
      moveSpeed: String(pull.boostedStats.moveSpeed),
      turnSpeed: String(Math.round(pull.boostedStats.turnSpeed)),
      suppressionRecovery: String(
        Math.round(pull.boostedStats.suppressionRecovery),
      ),
      fovDegrees: String(Math.round(pull.boostedStats.fovDegrees)),
    };
    if (pull.bonusWeapons && pull.bonusWeapons.length > 0) {
      if (!extraEquipment[pull.doll.id]) extraEquipment[pull.doll.id] = [];
      for (const bw of pull.bonusWeapons) {
        extraEquipment[pull.doll.id].push(bw.itemId);
      }
    }
  }

  // Copy gacha form values to download modal inputs
  document.getElementById("unitName").value =
    document.getElementById("gachaUnitName").value;
  document.getElementById("flagColour").value =
    document.getElementById("gachaFlagColour").value;
  document.getElementById("modAuthor").value =
    document.getElementById("gachaAuthor").value;
  document.getElementById("modDescription").value =
    document.getElementById("gachaDesc").value ||
    "Gacha unit generated by the GFL2:DK Unit Builder.";

  doDownload("#gachaDownloadBtn", extraEquipment).then(() => {
    // Restore original state and clear saved pulls
    clearGachaPulls();
    unitDolls = savedUnitDolls;
    dollOverrides = savedOverrides;
    renderContent();
    renderRoster();
  });
}

function playGachaPull() {
  playTick(1000, 0.04, 0.15);
}

function playGachaTick(progress) {
  const freq = 400 + progress * 600;
  const vol = 0.04 + progress * 0.1;
  playTick(freq, 0.04, vol);
}

function playGachaReveal(grade) {
  if (soundMuted || !audioReady()) return;
  if (grade === "common") {
    playTick(600, 0.1, 0.1);
  } else if (grade === "Rare") {
    playTick(700, 0.08, 0.1);
    setTimeout(() => playTick(900, 0.08, 0.1), 100);
  } else if (grade === "SR") {
    playTick(700, 0.08, 0.12);
    setTimeout(() => playTick(900, 0.08, 0.12), 80);
    setTimeout(() => playTick(1100, 0.08, 0.12), 160);
  } else {
    // Legendary — sweep like playBoot but higher
    const ctx = audioCtx;
    [800, 1100, 1400].forEach((freq, i) => {
      setTimeout(() => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.001, ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.15);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      }, i * 100);
    });
  }
}
