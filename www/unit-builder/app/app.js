const MAX_DOLLS = 32;

const DOLL_ABILITIES = {
  "GFL-DOLL-AK15": [
    {
      name: "Titanium Kick",
      desc: "Greatly enhanced door kick that deals massive damage and can breach reinforced doors much faster than other dolls.",
    },
  ],
  "GFL-DOLL-VECTOR": [
    {
      name: "Searing Finale",
      desc: "Incendiary grenades that spread fire over a wide area, burning and stunning enemies caught in the blaze.",
    },
  ],
};

let allDolls = [];
let allSquads = [];
let unitDolls = [];
let dollOverrides = {}; // { dollId: { health, moveSpeed, suppressionRecovery, fovDegrees } }

// ── Sound effects ──
let audioCtx = null;
let soundMuted = localStorage.getItem("soundMuted") === "true";

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Audio is unlocked by the splash screen click (dismissSplash calls getAudioCtx)
// If no splash (URL has hash), unlock on first interaction
function unlockAudio() {
  getAudioCtx();
  for (const evt of ["mousedown", "keydown", "touchstart"]) {
    document.removeEventListener(evt, unlockAudio);
  }
}

function audioReady() {
  return audioCtx && audioCtx.state === "running";
}

function playTick(freq = 880, duration = 0.06, vol = 0.12) {
  if (soundMuted || !audioReady()) return;
  const ctx = audioCtx;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playHover() {
  playTick(700, 0.03, 0.04);
}
function playAdd() {
  playTick(1200, 0.07, 0.1);
}
function playRemove() {
  playTick(400, 0.09, 0.08);
}
function playTabSwitch() {
  playTick(900, 0.04, 0.06);
}
function playBoot() {
  if (soundMuted || !audioReady()) return;
  const ctx = audioCtx;
  [500, 750].forEach((freq) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  });
}
function playReject() {
  if (soundMuted || !audioReady()) return;
  playTick(220, 0.12, 0.1);
  setTimeout(() => playTick(180, 0.12, 0.1), 80);
}
function playDownload() {
  if (soundMuted) return;
  [0, 80, 160].forEach((delay, i) => {
    setTimeout(() => {
      playTick(600 + i * 200, 0.08, 0.08);
    }, delay);
  });
}

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem("soundMuted", soundMuted);
  updateSoundToggle();
  if (!soundMuted) playAdd();
}

function updateSoundToggle() {
  const el = document.getElementById("soundToggle");
  el.innerHTML = soundMuted
    ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
}

function showToast(message, duration = 2500) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("hiding");
    toast.addEventListener("animationend", () => toast.remove());
  }, duration);
}

function closeGamesMenu() {
  const dropdown = document.getElementById("gamesDropdown");
  if (dropdown) dropdown.classList.remove("open");
}

// Hover with delay for cross-browser support
(function () {
  let hideTimeout;
  document.addEventListener("DOMContentLoaded", () => {
    const dropdown = document.getElementById("gamesDropdown");
    if (!dropdown) return;
    dropdown.addEventListener("mouseenter", () => {
      clearTimeout(hideTimeout);
      dropdown.classList.add("open");
    });
    dropdown.addEventListener("mouseleave", () => {
      hideTimeout = setTimeout(() => dropdown.classList.remove("open"), 150);
    });
  });
})();

let activeSquadFilters = new Set();
let activeWeaponFilters = new Set();
let filterCostume = false;
let filterAbility = false;
let filterSuppressor = false;
let BACKGROUNDS = [];
let squadIcons = {};
let MOD_VERSION = "";

async function init() {
  try {
    const resp = await fetch("data/dolls.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    allDolls = data.dolls;
    allSquads = data.squads;
    squadIcons = data.squadIcons || {};
    BACKGROUNDS = data.backgrounds || [];
    MOD_VERSION = data.version || "";
  } catch (e) {
    document.getElementById("loading").textContent =
      "Failed to load doll data. Run the build script first.";
    console.error(e);
    return;
  }

  document.getElementById("unitName").value = randomUnitName();
  initColourSwatches();
  updateSoundToggle();
  updateGachaBtn();
  setBackground();
  renderSquadTabs();
  renderWeaponTabs();
  renderContent();
  restoreState();
  setupTooltip();
  document.getElementById("loading").classList.add("hidden");

  document
    .getElementById("searchInput")
    .addEventListener("input", renderContent);
  document
    .getElementById("downloadBtn")
    .addEventListener("click", showDownloadModal);
  document.getElementById("rosterPortraits").addEventListener(
    "wheel",
    (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        rosterWheelBounce(e.currentTarget, e.deltaY);
      }
    },
    { passive: false },
  );
  window.addEventListener("hashchange", () => {
    handleRoute();
    restoreState();
  });
  handleRoute();
}

function handleRoute() {
  const hash = window.location.hash.replace("#", "");
  if (hash === "gacha") {
    startGacha();
  } else if (hash === "girldle") {
    openGirldle();
  }
}

function setBackground() {
  if (BACKGROUNDS.length === 0) return;
  const hour = new Date().getHours();
  const idx = hour % BACKGROUNDS.length;
  document.getElementById("bgImage").style.backgroundImage =
    `url('${BACKGROUNDS[idx]}')`;
}

function getFilteredDolls() {
  const search = document.getElementById("searchInput").value.toLowerCase();

  return allDolls.filter((d) => {
    if (activeSquadFilters.size > 0 && !activeSquadFilters.has(d.squad))
      return false;
    if (
      activeWeaponFilters.size > 0 &&
      !activeWeaponFilters.has(d.weapon.category)
    )
      return false;
    if (filterCostume && d.skins.length <= 1) return false;
    if (filterAbility && !DOLL_ABILITIES[d.id]) return false;
    if (filterSuppressor && !d.weapon.hasSuppressor) return false;
    if (search) {
      const hay =
        `${d.name} ${d.entityName} ${d.weapon.name} ${d.squad} ${d.description}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });
}

function renderContent() {
  const container = document.getElementById("dollContent");
  const dolls = getFilteredDolls();

  if (dolls.length === 0) {
    container.innerHTML =
      '<div class="no-results">No dolls match your filters.</div>';
    return;
  }

  // Group by squad
  const grouped = {};
  for (const d of dolls) {
    const squad = d.squad || "Unknown";
    if (!grouped[squad]) grouped[squad] = [];
    grouped[squad].push(d);
  }

  // Render in squad order
  const orderedSquads = allSquads.filter((s) => grouped[s]);
  // Add any squads not in the predefined order
  for (const s of Object.keys(grouped)) {
    if (!orderedSquads.includes(s)) orderedSquads.push(s);
  }

  container.innerHTML = orderedSquads
    .map((squad) => {
      const squadDolls = grouped[squad];
      const cards = squadDolls
        .map((d) => {
          const inUnit = unitDolls.includes(d.id);
          const isFull = unitDolls.length >= MAX_DOLLS;
          const cls = [
            "doll-card",
            inUnit ? "in-unit" : "",
            !inUnit && isFull ? "roster-full" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const imgHtml = d.portrait
            ? `<img src="${esc(d.portrait)}" alt="${esc(d.name)}" loading="lazy" />`
            : `<div class="no-portrait">${esc(d.name)}</div>`;

          const hasAbility = !!DOLL_ABILITIES[d.id];
          const hasSkins = d.skins.length > 1;
          const hasSup = !!d.weapon.hasSuppressor;
          const badges =
            hasAbility || hasSkins || hasSup
              ? `<div class="card-badges">${hasAbility ? `<div class="card-badge card-badge-ability"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg></div>` : ""}${hasSkins ? `<div class="card-badge card-badge-skin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg></div>` : ""}${hasSup ? `<div class="card-badge card-badge-suppressor"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="9.5" width="5" height="5" /><rect x="6" y="8" width="17" height="8" /></svg></div>` : ""}</div>`
              : "";
          return `<div class="${cls}" data-id="${esc(d.id)}" onclick="toggleDoll('${esc(d.id)}')">${badges}${imgHtml}<div class="card-name">${esc(d.name)}</div></div>`;
        })
        .join("");

      const iconSrc = squadIcons[squad];
      const iconHtml = iconSrc ? `<img src="${esc(iconSrc)}" alt="" />` : "";

      const squadDollIds = squadDolls.map((d) => d.id);
      const allInUnit = squadDollIds.every((id) => unitDolls.includes(id));
      const canAdd = !allInUnit && unitDolls.length < MAX_DOLLS;
      const showDisabled = !allInUnit && !canAdd;
      const addAllBtn = `<button class="squad-add-all ${allInUnit ? "active" : ""} ${showDisabled ? "disabled" : ""}" onclick="event.stopPropagation(); toggleSquadDolls('${esc(squad)}')" ${showDisabled ? "disabled" : ""}>${allInUnit ? "Remove all" : "Add all"}</button>`;

      return `<div class="squad-section">
<div class="squad-header">${iconHtml}${esc(squad)}${addAllBtn}</div>
<div class="squad-grid">${cards}</div>
        </div>`;
    })
    .join("");
}

let lastAddedDoll = null;

function toggleDoll(id) {
  const idx = unitDolls.indexOf(id);
  let added = false;
  if (idx >= 0) {
    unitDolls.splice(idx, 1);
    lastAddedDoll = null;
  } else if (unitDolls.length < MAX_DOLLS) {
    unitDolls.push(id);
    lastAddedDoll = id;
    added = true;
  }
  if (added) playAdd();
  else if (idx >= 0) playRemove();
  else playReject();

  renderSquadTabs();
  renderWeaponTabs();
  renderContent();
  renderRoster();
  saveState();

  // Pulse the card
  const card = document.querySelector(`.doll-card[data-id="${id}"]`);
  if (card) {
    const cls = added ? "pulse-add" : "pulse-remove";
    card.classList.remove("pulse-add", "pulse-remove");
    // Force reflow to restart animation
    void card.offsetWidth;
    card.classList.add(cls);
    card.addEventListener("animationend", () => card.classList.remove(cls), {
      once: true,
    });
  }
}

function toggleSquadDolls(squad) {
  const squadDollIds = allDolls
    .filter((d) => d.squad === squad)
    .map((d) => d.id);
  const allInUnit = squadDollIds.every((id) => unitDolls.includes(id));

  const someInUnit = squadDollIds.some((id) => unitDolls.includes(id));

  if (allInUnit) {
    // Remove all dolls from this squad
    for (const id of squadDollIds) {
      const idx = unitDolls.indexOf(id);
      if (idx >= 0) unitDolls.splice(idx, 1);
    }
    playRemove();
  } else if (unitDolls.length >= MAX_DOLLS && !someInUnit) {
    playReject();
    return;
  } else {
    // Add missing dolls from this squad (respecting cap)
    let added = 0;
    for (const id of squadDollIds) {
      if (!unitDolls.includes(id) && unitDolls.length < MAX_DOLLS) {
        unitDolls.push(id);
        added++;
      }
    }
    if (added > 0) playAdd();
    else {
      playReject();
      return;
    }
  }

  renderSquadTabs();
  renderWeaponTabs();
  renderContent();
  renderRoster();
  saveState();
}

function renderSquadTabs() {
  const container = document.getElementById("squadTabs");

  // Count selected dolls per squad
  const squadCounts = {};
  for (const id of unitDolls) {
    const d = allDolls.find((x) => x.id === id);
    if (!d) continue;
    squadCounts[d.squad] = (squadCounts[d.squad] || 0) + 1;
  }

  container.innerHTML = allSquads
    .map((s) => {
      const active = activeSquadFilters.has(s) ? " active" : "";
      const count = squadCounts[s] || 0;
      const badge =
        count > 0 ? `<span class="squad-tab-count">${count}</span>` : "";
      return `<button class="filter-toggle${active}" onclick="toggleSquadFilter('${esc(s)}')">${esc(s)}${badge}</button>`;
    })
    .join("");
}

function renderWeaponTabs() {
  const container = document.getElementById("weaponTabs");
  const WEAPON_LABELS = {
    rifle: "Rifle",
    smg: "SMG",
    shotgun: "Shotgun",
    dmr: "DMR",
    sniper: "Sniper",
    lmg: "LMG",
    pistol: "Pistol",
    melee: "Melee",
  };
  const WEAPON_ORDER = [
    "rifle",
    "smg",
    "shotgun",
    "dmr",
    "sniper",
    "lmg",
    "pistol",
    "melee",
  ];
  const present = new Set(allDolls.map((d) => d.weapon.category));
  const cats = WEAPON_ORDER.filter((c) => present.has(c));

  // Count selected dolls per weapon category
  const weaponCounts = {};
  for (const id of unitDolls) {
    const d = allDolls.find((x) => x.id === id);
    if (!d) continue;
    weaponCounts[d.weapon.category] =
      (weaponCounts[d.weapon.category] || 0) + 1;
  }

  container.innerHTML = cats
    .map((c) => {
      const active = activeWeaponFilters.has(c) ? " active" : "";
      const label = WEAPON_LABELS[c] || c.toUpperCase();
      const count = weaponCounts[c] || 0;
      const badge =
        count > 0 ? `<span class="squad-tab-count">${count}</span>` : "";
      return `<button class="filter-toggle${active}" onclick="toggleWeaponFilter('${esc(c)}')">${esc(label)}${badge}</button>`;
    })
    .join("");
}

function toggleSquadFilter(squad) {
  if (activeSquadFilters.has(squad)) {
    activeSquadFilters.delete(squad);
  } else {
    activeSquadFilters.add(squad);
  }
  playTabSwitch();
  renderSquadTabs();
  renderContent();
}

function toggleWeaponFilter(cat) {
  if (activeWeaponFilters.has(cat)) {
    activeWeaponFilters.delete(cat);
  } else {
    activeWeaponFilters.add(cat);
  }
  playTabSwitch();
  renderWeaponTabs();
  renderContent();
}

function toggleFilter(type) {
  if (type === "costume")
    filterCostume = document.getElementById("filterCostume").checked;
  if (type === "ability")
    filterAbility = document.getElementById("filterAbility").checked;
  if (type === "suppressor")
    filterSuppressor = document.getElementById("filterSuppressor").checked;
  playTabSwitch();
  renderContent();
}

function animateRosterCount(label, count) {
  const str = String(count);
  const suffix = `<span>\u2009/\u200932</span>`;
  // Rebuild DOM if digit count changed
  const inners = label.querySelectorAll(".roster-digit-inner");
  if (inners.length !== str.length) {
    let html = "";
    for (let i = 0; i < str.length; i++) {
      html += `<span class="roster-digit"><span class="roster-digit-inner">`;
      for (let d = 0; d <= 9; d++) html += `<span>${d}</span>`;
      html += `</span></span>`;
    }
    html += suffix;
    label.innerHTML = html;
    label.offsetHeight; // force layout
  }
  // Roll each digit to its target
  label.querySelectorAll(".roster-digit-inner").forEach((inner, i) => {
    const d = parseInt(str[i]);
    inner.style.transform = `translateY(${-d * 12}px)`;
  });
  label.style.color = count >= MAX_DOLLS ? "var(--accent)" : "";
}

function renderRoster() {
  const bar = document.getElementById("rosterBar");
  const portraits = document.getElementById("rosterPortraits");
  const label = document.getElementById("rosterLabel");

  if (unitDolls.length === 0) {
    bar.classList.remove("visible");
    return;
  }

  bar.classList.add("visible");

  animateRosterCount(label, unitDolls.length);

  portraits.innerHTML = unitDolls
    .map((id) => {
      const d = allDolls.find((x) => x.id === id);
      if (!d) return "";
      const img = d.portrait
        ? `<img src="${esc(d.portrait)}" alt="${esc(d.name)}" />`
        : "";
      const isNew = id === lastAddedDoll ? " new" : "";
      return `<div class="roster-slot${isNew}" data-id="${esc(d.id)}" onclick="if(!rosterDragged)toggleDoll('${esc(d.id)}')" title="${esc(d.name)}">${img}</div>`;
    })
    .join("");
  if (lastAddedDoll) {
    portraits.scrollTo({
      left: portraits.scrollWidth,
      behavior: "smooth",
    });
  }
  lastAddedDoll = null;
}

// ── Tooltip on hover ──

function setupTooltip() {
  const tooltip = document.getElementById("tooltip");
  let currentCard = null;

  document.addEventListener("mouseover", (e) => {
    // Gacha roster slot tooltips
    const gachaSlot = e.target.closest(".gacha-roster-slot");
    if (gachaSlot && gachaSlot.dataset.pullIdx != null) {
      if (gachaSlot === currentCard) return;
      currentCard = gachaSlot;
      const pull = gachaPulls[parseInt(gachaSlot.dataset.pullIdx)];
      if (!pull) return;
      const d = pull.doll;
      const statNames = {
        health: "HP",
        moveSpeed: "Speed",
        turnSpeed: "Turn",
        suppressionRecovery: "Sup. Rec.",
        fovDegrees: "FOV",
      };
      const statsHtml = Object.entries(pull.boosts)
        .map(([stat, boost]) => {
          const pct = Math.round(boost * 100);
          const colour = pct >= 0 ? "#4fdb6a" : "#db4f4f";
          return `<div class="tooltip-stat"><div class="tooltip-stat-label">${statNames[stat]}</div><div class="tooltip-stat-value" style="color:${colour}">${pct >= 0 ? "+" : ""}${pct}%</div></div>`;
        })
        .join("");
      const dupeBonusTip =
        pull.dupeCount > 0
          ? Math.round((pull.dupeBonus || 0.05) * 100 * pull.dupeCount)
          : 0;
      const bonusWeaponNames = (pull.bonusWeapons || [])
        .map((bw) => bw.name)
        .join(", ");
      const dupeHtml =
        pull.dupeCount > 0
          ? `<div style="font-size:12px;color:var(--accent);margin-top:6px">V${pull.dupeCount + 1} · +${dupeBonusTip}% dupe bonus${bonusWeaponNames ? " + " + esc(bonusWeaponNames) : ""}</div>`
          : "";
      tooltip.innerHTML = `
<div class="tooltip-name">${esc(d.name)}</div>
<div class="tooltip-squad" style="color:${pull.gradeColour}">${pull.grade.toUpperCase()}</div>
<div class="tooltip-stats">${statsHtml}</div>
${dupeHtml}
        `;
      tooltip.classList.add("visible");
      positionTooltip(e);
      return;
    }

    // Mini tooltip for roster slots
    const slot = e.target.closest(".roster-slot");
    if (slot) {
      if (slot === currentCard) return;
      currentCard = slot;
      const d = allDolls.find((x) => x.id === slot.dataset.id);
      if (!d) return;
      tooltip.innerHTML = `
<div class="tooltip-name">${esc(d.name)}</div>
<div class="tooltip-squad">${esc(d.squad)}</div>
<div class="tooltip-stats">
    <div class="tooltip-stat"><div class="tooltip-stat-label">Weapon</div><div class="tooltip-stat-value">${esc(d.weapon.name)}</div></div>
    <div class="tooltip-stat"><div class="tooltip-stat-label">Type</div><div class="tooltip-stat-value">${esc(formatCategory(d.weapon.category))}</div></div>
</div>
<div class="tooltip-hint" style="color:var(--danger)">Click to remove</div>
        `;
      tooltip.classList.add("visible");
      positionTooltip(e);
      return;
    }

    const card = e.target.closest(".doll-card");
    if (!card || card === currentCard) return;
    currentCard = card;
    playHover();

    const d = allDolls.find((x) => x.id === card.dataset.id);
    if (!d) return;

    const skinList =
      d.skins.length > 1
        ? d.skins
            .slice(1)
            .map((s) => s.name)
            .join(", ")
        : "";

    const inUnit = unitDolls.includes(d.id);

    tooltip.innerHTML = `
<div class="tooltip-name">${esc(d.name)}</div>
<div class="tooltip-squad">${esc(d.squad)}</div>
<div class="tooltip-desc">${esc(d.description)}</div>
<div class="tooltip-stats">
    <div class="tooltip-stat"><div class="tooltip-stat-label">Weapon</div><div class="tooltip-stat-value">${esc(d.weapon.name)}</div></div>
    <div class="tooltip-stat"><div class="tooltip-stat-label">Type</div><div class="tooltip-stat-value">${esc(formatCategory(d.weapon.category))}</div></div>
    <div class="tooltip-stat"><div class="tooltip-stat-label">Magazine</div><div class="tooltip-stat-value">${d.weapon.magazine && d.weapon.magazine !== "0" ? d.weapon.magazine : "—"}</div></div>
    <div class="tooltip-stat"><div class="tooltip-stat-label">Operation</div><div class="tooltip-stat-value">${d.weapon.fireMode && d.weapon.fireMode !== "Melee" ? esc(d.weapon.fireMode) : "—"}</div></div>
</div>
${(DOLL_ABILITIES[d.id] || []).map((a) => `<div class="tooltip-ability"><div class="tooltip-ability-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/></svg>Ability</div><div class="tooltip-ability-name">${esc(a.name)}</div><div class="tooltip-ability-desc">${esc(a.desc)}</div></div>`).join("")}
${skinList ? `<div class="tooltip-skins"><div class="tooltip-skins-label"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>Additional Costumes</div><div class="tooltip-skins-list">${esc(skinList)}</div></div>` : ""}
<div class="tooltip-hint${inUnit ? " tooltip-hint-full" : !inUnit && unitDolls.length >= MAX_DOLLS ? " tooltip-hint-full" : ""}">${inUnit ? "Click to remove" : unitDolls.length >= MAX_DOLLS ? "Unit is full" : "Click to add"}</div>
        `;

    tooltip.classList.add("visible");
    positionTooltip(e);
  });

  document.addEventListener("mousemove", (e) => {
    if (tooltip.classList.contains("visible")) {
      positionTooltip(e);
    }
  });

  document.addEventListener("mouseout", (e) => {
    const card =
      e.target.closest(".doll-card") ||
      e.target.closest(".roster-slot") ||
      e.target.closest(".gacha-roster-slot");
    if (card && !card.contains(e.relatedTarget)) {
      tooltip.classList.remove("visible");
      currentCard = null;
    }
  });

  function positionTooltip(e) {
    const pad = 12;
    let x = e.clientX + pad;
    let y = e.clientY + pad;

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;

    if (x + tw > window.innerWidth - pad) {
      x = e.clientX - tw - pad;
    }
    if (y + th > window.innerHeight - pad) {
      y = e.clientY - th - pad;
    }

    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
  }
}

// ── Random unit name generator ──

const NAME_ADJ = [
  "Iron",
  "Crimson",
  "Ashen",
  "Silent",
  "Pale",
  "Hollow",
  "Collapse",
  "Reverse",
  "Neural",
  "Polar",
  "Volatile",
  "Residual",
  "Dormant",
  "Inverse",
  "Adaptive",
  "Covert",
  "Forward",
  "Fortified",
  "Rapid",
  "Lethal",
  "Exiled",
  "Stray",
  "Relic",
  "Phantom",
  "Rusted",
  "Gilded",
  "Fractured",
  "Severed",
  "Veiled",
  "Scarred",
  "Scorched",
  "Frozen",
  "Ferric",
  "Deep",
  "Buried",
  "Lost",
];

const NAME_NOUN = [
  "Protocol",
  "Signal",
  "Echelon",
  "Vanguard",
  "Resonance",
  "Singularity",
  "Turbulence",
  "Parallax",
  "Convergence",
  "Bastion",
  "Frontier",
  "Citadel",
  "Threshold",
  "Outpost",
  "Eclipse",
  "Requiem",
  "Exodus",
  "Remnant",
  "Overture",
  "Salvo",
  "Arsenal",
  "Directive",
  "Covenant",
  "Mandate",
  "Sortie",
  "Incursion",
  "Reprisal",
  "Skirmish",
  "Ember",
  "Shard",
  "Dusk",
  "Anvil",
  "Crucible",
  "Pyre",
  "Spectre",
  "Wraith",
  "Pendulum",
  "Cipher",
  "Helix",
];

const FLAG_PRESETS = [
  "#e3f6fd", // default light blue
  "#d4853b", // GFL orange
  "#c4424b", // red
  "#4b8f4e", // military green
  "#5b7fbf", // steel blue
  "#9b6fbf", // purple
  "#bf9b4e", // gold
  "#e0e0e0", // white
  "#3a3a3a", // dark grey
];

function updateColourDisplay(hex, previewId, hexId, swatchesId) {
  previewId = previewId || "colourPreviewBar";
  hexId = hexId || "colourHex";
  swatchesId = swatchesId || "colourSwatches";
  document.getElementById(previewId).style.background = hex;
  document.getElementById(hexId).textContent = hex.toUpperCase();
  const container = document.getElementById(swatchesId);
  container.querySelectorAll(".colour-swatch").forEach((s) => {
    s.classList.toggle("active", s.title === hex);
  });
}

function initColourSwatches(pickerId, previewId, hexId, swatchesId) {
  pickerId = pickerId || "flagColour";
  previewId = previewId || "colourPreviewBar";
  hexId = hexId || "colourHex";
  swatchesId = swatchesId || "colourSwatches";
  const container = document.getElementById(swatchesId);
  const picker = document.getElementById(pickerId);
  container.innerHTML = "";

  updateColourDisplay(picker.value, previewId, hexId, swatchesId);

  FLAG_PRESETS.forEach((hex) => {
    const el = document.createElement("div");
    el.className = "colour-swatch" + (picker.value === hex ? " active" : "");
    el.style.background = hex;
    el.title = hex;
    el.addEventListener("click", () => {
      picker.value = hex;
      updateColourDisplay(hex, previewId, hexId, swatchesId);
    });
    container.appendChild(el);
  });

  picker.addEventListener("input", () => {
    updateColourDisplay(picker.value, previewId, hexId, swatchesId);
  });
}

function randomUnitName() {
  const a = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const n = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${a} ${n}`;
}

// ── State persistence via URL hash (base64url-encoded bitmask) ──

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bitsToBase64url(bits) {
  if (bits === 0n) return "A";
  let s = "";
  while (bits > 0n) {
    s = B64[Number(bits & 63n)] + s;
    bits >>= 6n;
  }
  return s;
}

function base64urlToBits(s) {
  let bits = 0n;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) return 0n;
    bits = (bits << 6n) | BigInt(v);
  }
  return bits;
}

function saveState() {
  // Encode selected dolls as a base64url bitmask using stable bitIndex from entity order
  let bits = 0n;
  for (const id of unitDolls) {
    const doll = allDolls.find((d) => d.id === id);
    if (doll && doll.bitIndex != null) bits |= 1n << BigInt(doll.bitIndex);
  }
  history.replaceState(null, "", "#" + bitsToBase64url(bits));
}

const RESERVED_ROUTES = new Set(["gacha", "girldle"]);

function restoreState() {
  const hash = location.hash.slice(1);
  if (!hash || RESERVED_ROUTES.has(hash)) return;
  try {
    const bits = base64urlToBits(hash);
    unitDolls = [];
    for (const doll of allDolls) {
      if (doll.bitIndex != null && bits & (1n << BigInt(doll.bitIndex)))
        unitDolls.push(doll.id);
    }
    renderSquadTabs();
    renderWeaponTabs();
    renderContent();
    renderRoster();
  } catch (e) {}
}

function closeModal(id) {
  document.getElementById(id).classList.remove("visible");
  document.body.classList.remove("modal-open");
}

function showDownloadModal() {
  renderUnitSummary();
  document.getElementById("downloadModal").classList.add("visible");
  document.body.classList.add("modal-open");
}

function renderUnitSummary() {
  const container = document.getElementById("unitSummary");
  if (unitDolls.length === 0) {
    container.innerHTML = "";
    return;
  }

  const dolls = unitDolls
    .map((id) => allDolls.find((x) => x.id === id))
    .filter(Boolean);

  // Weapon breakdown
  const weapons = {};
  const squads = {};
  for (const d of dolls) {
    const cat = formatCategory(d.weapon.category) || "Other";
    weapons[cat] = (weapons[cat] || 0) + 1;
    squads[d.squad] = (squads[d.squad] || 0) + 1;
  }

  const weaponHtml = Object.entries(weapons)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([cat, n]) =>
        `<div class="unit-summary-weapon"><span>${n}</span> ${esc(cat)}</div>`,
    )
    .join("");

  const squadHtml = Object.entries(squads)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([s, n]) =>
        `<div class="unit-summary-weapon"><span>${n}</span> ${esc(s)}</div>`,
    )
    .join("");

  container.innerHTML = `
        <div class="unit-summary-stat">
            <div class="unit-summary-label">Dolls</div>
            <div class="unit-summary-value">${dolls.length}</div>
        </div>
        <div class="unit-summary-stat" style="flex: 1;">
            <div class="unit-summary-label">Weapons</div>
            <div class="unit-summary-weapons">${weaponHtml}</div>
        </div>
        <div class="unit-summary-stat" style="flex-basis: 100%;">
            <div class="unit-summary-label">Squads</div>
            <div class="unit-summary-weapons">${squadHtml}</div>
        </div>
    `;
}

function toggleAdvanced(btn) {
  btn.classList.toggle("open");
  const body = document.getElementById("advancedStats");
  body.classList.toggle("open");
  if (body.classList.contains("open")) renderAdvancedStats();
}

function renderAdvancedStats() {
  const body = document.getElementById("advancedStats");
  const dolls = unitDolls
    .map((id) => allDolls.find((x) => x.id === id))
    .filter(Boolean);
  if (!dolls.length) {
    body.innerHTML =
      "<p style='color:var(--text-muted);font-size:12px;'>No dolls selected.</p>";
    return;
  }

  body.innerHTML = dolls
    .map((d) => {
      const e = d.entity;
      const o = dollOverrides[d.id] || {};
      const hp = o.health ?? e.health;
      const spd = o.moveSpeed ?? e.moveSpeed;
      const sup = o.suppressionRecovery ?? e.suppressionRecovery;
      const fov = o.fovDegrees ?? e.fovDegrees;
      const trn = o.turnSpeed ?? e.turnSpeed;
      const img = d.portrait
        ? `<img src="${esc(d.portrait)}" alt="${esc(d.name)}"/>`
        : "";

      return `<div class="stat-row">
            <div class="stat-row-portrait">${img}</div>
            <div class="stat-row-name" title="${esc(d.name)}">${esc(d.name)}</div>
            <div class="stat-row-fields">
                <div class="stat-field">
                    <div class="stat-field-label">HP</div>
                    <input type="number" value="${hp}" data-doll="${esc(d.id)}" data-stat="health" data-default="${e.health}" onchange="updateDollStat(this)" />
                </div>
                <div class="stat-field">
                    <div class="stat-field-label">Speed</div>
                    <input type="number" step="0.1" value="${spd}" data-doll="${esc(d.id)}" data-stat="moveSpeed" data-default="${e.moveSpeed}" onchange="updateDollStat(this)" />
                </div>
                <div class="stat-field">
                    <div class="stat-field-label">Turn</div>
                    <input type="number" value="${Math.round(trn)}" data-doll="${esc(d.id)}" data-stat="turnSpeed" data-default="${e.turnSpeed}" onchange="updateDollStat(this)" />
                </div>
                <div class="stat-field">
                    <div class="stat-field-label">Sup. Rec.</div>
                    <input type="number" value="${Math.round(sup)}" data-doll="${esc(d.id)}" data-stat="suppressionRecovery" data-default="${e.suppressionRecovery}" onchange="updateDollStat(this)" />
                </div>
                <div class="stat-field">
                    <div class="stat-field-label">FOV</div>
                    <input type="number" value="${fov}" data-doll="${esc(d.id)}" data-stat="fovDegrees" data-default="${e.fovDegrees}" onchange="updateDollStat(this)" />
                </div>
            </div>
        </div>`;
    })
    .join("");
}

function updateDollStat(input) {
  const id = input.dataset.doll;
  const stat = input.dataset.stat;
  const def = input.dataset.default;
  const val = input.value;

  if (!dollOverrides[id]) dollOverrides[id] = {};

  if (val === def || val === "") {
    delete dollOverrides[id][stat];
    if (!Object.keys(dollOverrides[id]).length) delete dollOverrides[id];
    input.classList.remove("modified");
  } else {
    dollOverrides[id][stat] = val;
    input.classList.add("modified");
  }
}

function copyPath(id) {
  const el = document.getElementById(id);
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = el.nextElementSibling;
    btn.textContent = "Copied";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("copied");
    }, 1500);
  });
}

function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("hidden");
  setTimeout(() => splash.remove(), 300);
  getAudioCtx();
  setTimeout(() => playBoot(), 50);
}

function showAbout() {
  // Re-create splash as a modal
  const splash = document.getElementById("splash");
  if (splash) {
    // Still showing, ignore
    return;
  }
  const div = document.createElement("div");
  div.className = "splash";
  div.id = "splash";
  div.onclick = dismissSplash;
  div.innerHTML = document.getElementById("splashTemplate").innerHTML;
  document.body.appendChild(div);
  const sv = document.getElementById("splashVersion");
  if (sv && MOD_VERSION) sv.textContent = `v${MOD_VERSION}`;
}

// ── Mod generation ──

function slugify(name) {
  return (
    name
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toUpperCase() || "CUSTOM"
  );
}

async function doDownload(btnSelector, extraEquipment) {
  if (unitDolls.length === 0) return;

  const unitName =
    document.getElementById("unitName").value.trim() || randomUnitName();
  const flagColour = document
    .getElementById("flagColour")
    .value.replace("#", "");
  const slug = slugify(unitName);

  // Build base64url bitmask for unique prefix (stable bitIndex from entity order)
  let bits = 0n;
  for (const id of unitDolls) {
    const doll = allDolls.find((d) => d.id === id);
    if (doll && doll.bitIndex != null) bits |= 1n << BigInt(doll.bitIndex);
  }
  const bitmaskId = bitsToBase64url(bits).toLowerCase();
  const prefix = `gfl_custom_${bitmaskId}`;
  const unitId = `GFL-UNIT-CUSTOM-${bitmaskId}-${slug}`;
  const folderName = `gfl-custom-${bitmaskId}`;

  const dolls = unitDolls
    .map((id) => {
      const d = allDolls.find((x) => x.id === id);
      return d ? { ...d, selectedSkin: null } : null;
    })
    .filter(Boolean);

  const zip = new JSZip();
  const folder = zip.folder(folderName);

  folder.file("mod.xml", generateModXml(unitName, unitId));
  folder.file(
    `units/${prefix}_unit.xml`,
    generateUnitXml(unitName, unitId, flagColour, dolls),
  );
  folder.file(
    `units/${prefix}_identities.xml`,
    generateIdentitiesXml(unitId, dolls),
  );
  folder.file(
    `entities/${prefix}_humans.xml`,
    generateEntitiesXml(unitId, dolls, bitmaskId),
  );
  folder.file(
    `gui/${prefix}_deploy.xml`,
    generateDeployXml(unitId, flagColour, dolls),
  );
  folder.file(
    `localization/${prefix}_game.txt`,
    generateLocalisationTxt(unitName, unitId, slug),
  );

  if (extraEquipment && Object.keys(extraEquipment).length > 0) {
    folder.file(
      `equipment/${prefix}_binds.xml`,
      generateBindsXml(extraEquipment),
    );
  }

  const btn = document.querySelector(
    btnSelector || "#downloadModal .btn-accent",
  );
  btn.disabled = true;
  btn.textContent = "Generating...";

  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gfl2dk-${slug.toLowerCase()}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  playDownload();

  btn.textContent = "Downloaded!";
  btn.style.background = "#2a7d4f";
  btn.style.borderColor = "#2a7d4f";
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = "Download";
    btn.style.background = "";
    btn.style.borderColor = "";
  }, 2000);
}

function xmlEsc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateModXml(unitName, unitId) {
  const author =
    document.getElementById("modAuthor").value.trim() || "Unit Builder";
  const desc =
    document.getElementById("modDescription").value.trim() ||
    "Custom unit generated by the GFL2:DK Unit Builder.";
  const fullDesc =
    desc +
    "\n\nRequires the base Girls' Frontline 2: Door Kickers mod." +
    (MOD_VERSION ? `\n\nBuilt with base mod v${MOD_VERSION}` : "");
  return `<Mod
    title="GFL2:DK Custom Unit - ${xmlEsc(unitName)}"
    gameVersion="112"
    author="${xmlEsc(author)}"
    description="${xmlEsc(fullDesc)}"
    changeNotes=""
    languageMod=""
    tags="Playable Units"
    ugcId=""
/>
`;
}

function generateUnitXml(unitName, unitId, flagColour, dolls) {
  const classes = dolls
    .map(
      (d) =>
        `        <Class
name="${xmlEsc(d.id)}"
nameUI="@${xmlEsc(d.id.replace("GFL-DOLL-", "DOLL-"))}-NAME"
description="@${xmlEsc(d.id.replace("GFL-DOLL-", "DOLL-"))}-DESC"
numSlots="1"
supply="100"
iconTex="data/textures/gui/deploy/class_icon_undercover.dds"
upgrades="BH_Defence1, BH_Offence1, BH_Defence2, BH_Offence2"
maxUpgradeable="2"
        />`,
    )
    .join("\n");

  return `<Units>
    <Unit
        name="${xmlEsc(unitId)}"
        nameUI="@${xmlEsc(unitId)}-NAME"
        description="@${xmlEsc(unitId)}-DESC"
        flagTex="data/textures/gfl_girl_bg.dds"
        flagColor="${xmlEsc(flagColour)}"
        movie="data/movies/gfl_unlock_girl.ogv"
        rndNameEntry="@#${xmlEsc(unitId)}-NAME-RND"
        voicepack="commander_eng"
        incapacitationChance="60"
        incapacitationChanceCrit="30"
    >
        <Classes>
${classes}
        </Classes>

        <TrooperRanks>
<Rank name="@agent_rank_0" xpNeeded="0" badgeTex="data/textures/gui/customization/cia_rank_01.dds" />
<Rank name="@agent_rank_1" xpNeeded="700" badgeTex="data/textures/gui/customization/cia_rank_02.dds" />
<Rank name="@agent_rank_2" xpNeeded="2300" badgeTex="data/textures/gui/customization/cia_rank_03.dds" />
<Rank name="@agent_rank_3" xpNeeded="5600" badgeTex="data/textures/gui/customization/cia_rank_04.dds" />
<Rank name="@agent_rank_4" xpNeeded="11800" badgeTex="data/textures/gui/customization/cia_rank_05.dds" />
<Rank name="@agent_rank_5" xpNeeded="22400" badgeTex="data/textures/gui/customization/cia_rank_06.dds" />
<Rank name="@agent_rank_6" xpNeeded="38400" badgeTex="data/textures/gui/customization/cia_rank_07.dds" />
<Rank name="@agent_rank_7" xpNeeded="60200" badgeTex="data/textures/gui/customization/cia_rank_08.dds" />
<Rank name="@agent_rank_8" xpNeeded="86400" badgeTex="data/textures/gui/customization/cia_rank_09.dds" />
<Rank name="@agent_rank_9" xpNeeded="126400" badgeTex="data/textures/gui/customization/cia_rank_10.dds" />
        </TrooperRanks>

        <Ranks>
<Rank xpNeeded="0" badgeTex="" />
<Rank xpNeeded="4000" badgeTex="" />
<Rank xpNeeded="9000" badgeTex="" />
<Rank xpNeeded="14980" badgeTex="" />
<Rank xpNeeded="21920" badgeTex="" />
<Rank xpNeeded="29800" badgeTex="" />
<Rank xpNeeded="38600" badgeTex="" />
<Rank xpNeeded="48310" badgeTex="" />
<Rank xpNeeded="58900" badgeTex="" />
<Rank xpNeeded="70360" badgeTex="" />
        </Ranks>
    </Unit>
</Units>
`;
}

function generateIdentitiesXml(unitId, dolls) {
  const entries = dolls
    .map(
      (d) =>
        `    <Portrait
        tex="${xmlEsc(d.entity.portrait)}"
        unit="${xmlEsc(unitId)}"
        class="${xmlEsc(d.id)}"
        gender="0"
        customName="${xmlEsc(d.name)}"
    />`,
    )
    .join("\n");

  return `<HumanIdentities>\n${entries}\n</HumanIdentities>\n`;
}

function generateEntitiesXml(unitId, dolls, bitmaskId) {
  const entities = dolls
    .map((d) => {
      const e = d.entity;
      const o = dollOverrides[d.id] || {};
      const entityName = `GFL-CUSTOM-${bitmaskId}-${e.name.replace("GIRL-", "")}`;

      let equipment = e.equipment.map((item) => {
        if (d.selectedSkin && item.startsWith("GFL_SKIN_")) {
          return d.selectedSkin.id;
        }
        return item;
      });

      const equipItems = equipment
        .map((item) => `                <Item name="${xmlEsc(item)}" />`)
        .join("\n");

      if (
        d.selectedSkin &&
        !e.equipment.some((item) => item.startsWith("GFL_SKIN_"))
      ) {
        equipment.push(d.selectedSkin.id);
      }

      const model = d.selectedSkin ? d.selectedSkin.model : e.model;
      const diffuseTex = d.selectedSkin
        ? d.selectedSkin.diffuseTex
        : e.diffuseTex;

      return `    <Entity name="${xmlEsc(entityName)}" type="Human" editorAutoHeight="false">
        <RenderObject3D
model="${xmlEsc(model)}"
diffuseTex="${xmlEsc(diffuseTex)}"
        />

        <Breakable
template="GenericTrooperGibs"
breakOnDamage="explosive"
deleteOnDeath="false"
        />
        <PhysicalParams health="${xmlEsc(o.health || e.health)}" />

        <Human type="GoodGuy" unit="${xmlEsc(unitId)}" class="${xmlEsc(d.id)}">
<Id
    name="${xmlEsc(e.idName)}"
    portrait="${xmlEsc(e.portrait)}"
    gender="${xmlEsc(e.gender)}"
    voicePack="${xmlEsc(e.voicePack)}"
/>
<FOV degrees="${xmlEsc(o.fovDegrees || e.fovDegrees)}" distanceMeters="${xmlEsc(e.fovDistance)}" eyeRadiusMeters="${xmlEsc(e.fovEyeRadius)}" />
<Brain suppressionRecovery="${xmlEsc(o.suppressionRecovery || e.suppressionRecovery)}" />

<Mobility>
    <MoveSpeed min="${xmlEsc(e.moveSpeedMin)}" defaultMetersPerSec="${xmlEsc(o.moveSpeed || e.moveSpeed)}" max="${xmlEsc(e.moveSpeedMax)}" />
    <TurnSpeed min="${xmlEsc(e.turnSpeedMin)}" defaultMetersPerSec="${xmlEsc(o.turnSpeed || e.turnSpeed)}" max="${xmlEsc(e.turnSpeedMax)}" />
</Mobility>

<Equipment>
${equipItems}
</Equipment>
        </Human>
    </Entity>`;
    })
    .join("\n\n");

  return `<Entities>\n${entities}\n</Entities>\n`;
}

function generateDeployXml(unitId, flagColour, dolls) {
  return generateDeployTabbed(unitId, flagColour, dolls);
}

function deployHeader(unitId, flagColour, sizeX = 396) {
  return `<GUIItems>
<EventActionBatch name="GAME_GUI_LOADTIME_ACTIONS">
    <Action type="Show" target="${xmlEsc(unitId)}" />
</EventActionBatch>

<Item name="${xmlEsc(unitId)}" origin="0 -312" hidden="true" align="rt" sizeX="${sizeX}">
    <OnOpen>
        <Action type="AddMeToParent" target="#unit_header" />
    </OnOpen>
`;
}

function deployClassEntry(doll, x, y, width, slotNum, flagColour, align) {
  const alignAttr = align ? ` align="${align}"` : "";
  const leftBarName = align ? ` name="#ClassBackgroundLeftBar"` : "";
  return `        <StaticImage name="${xmlEsc(doll.id)}" origin="${x} ${y}"${alignAttr}>
<RenderObject2D texture="data/textures/gui/square.tga" sizeX="${width}" sizeY="148" color="211e1dcc" />
<StaticImage name="#ClassHeader" origin="0 0" align="t">
    <RenderObject2D texture="data/textures/gui/square.tga" sizeX="${width}" sizeY="46" color="4B4B4B" />
</StaticImage>
<StaticImage origin="0 0" align="lt">
    <RenderObject2D texture="data/textures/gui/deploy/deploy_class_diagonalbars.dds" color="0c0b0b33" />
</StaticImage>
<StaticImage${leftBarName} origin="-16 0" align="lt">
    <RenderObject2D texture="data/textures/gui/square.tga" sizeX="8" sizeY="148" color="${xmlEsc(flagColour)}" />
</StaticImage>
<StaticText name="#ClassName" origin="-6 50" text="" align="r" font="header_4" textColor="211e1d" />
<StaticImage name="#ClassIcon" origin="8 50" align="l">
    <RenderObject2D texture="data/textures/gui/deploy/class_name_icon_assaulter.dds" />
</StaticImage>
<Item origin="-2 -25">
    <StaticImage name="#slot${slotNum}" origin="0 0">
        <RenderObject2D texture="data/textures/gui/deploy/deploy_trooperbackground_01.tga" />
    </StaticImage>
</Item>
        </StaticImage>`;
}

function generateDeployTabbed(unitId, flagColour, dolls) {
  const TABS_PER_ROW = 5;
  const tabs = [];
  const DOLLS_PER_TAB = 6;
  for (let i = 0; i < dolls.length; i += DOLLS_PER_TAB)
    tabs.push(dolls.slice(i, i + DOLLS_PER_TAB));

  // All tab checkbox names for uncheck actions
  const allTabNames = tabs.map((_, t) => `custom_tab${t}_cbox`);

  let xml = deployHeader(unitId, flagColour);

  // Split tabs into rows of TABS_PER_ROW
  const tabRows = [];
  for (let i = 0; i < tabs.length; i += TABS_PER_ROW)
    tabRows.push(
      tabs
        .slice(i, i + TABS_PER_ROW)
        .map((tab, j) => ({ tab, globalIdx: i + j })),
    );

  for (let row = 0; row < tabRows.length; row++) {
    const rowTabs = tabRows[row];
    const yOffset = -row * 72;
    xml += `
    <Item origin="0 ${yOffset}" name="custom_tab_menu_${row}" align="rt" sizeX="396" sizeY="64" hidden="false">
        <StaticImage name="tab_background" origin="0 0" align="r">
<RenderObject2D texture="data/textures/gui/square.tga" sizeX="380" sizeY="64" color="211e1dcc" />
        </StaticImage>
        <StaticImage name="#ClassBackgroundLeftBar" origin="0 0" align="l">
<RenderObject2D texture="data/textures/gui/square.tga" sizeX="8" sizeY="64" color="${xmlEsc(flagColour)}" />
        </StaticImage>\n`;

    for (let i = 0; i < rowTabs.length; i++) {
      const t = rowTabs[i].globalIdx;
      const xPos = -304 + i * 72;
      const isDefault = t === 0 ? "CheckedState" : "UncheckedState";
      const uncheckActions = allTabNames
        .filter((_, ot) => ot !== t)
        .map(
          (name) =>
            `                    <Action type="Uncheck" target="${name}" />`,
        )
        .join("\n");

      // SetOrigin based on doll rows in this tab: -608 for 1 row, -768 for 2, -928 for 3
      const tabDollCount = tabs[rowTabs[i].globalIdx].length;
      const dollRows = Math.ceil(tabDollCount / 2);
      const setOriginY = -608 - (dollRows - 1) * 160;

      xml += `
        <Checkbox name="custom_tab${t}_cbox" origin="${xPos} 0" align="r" stealFocus="true" defaultState="${isDefault}">
<UncheckedState>
    <RenderObject2D texture="data/textures/gui/square.tga" sizeX="64" sizeY="64" color="080808cc" />
    <OnOpen>
        <Action type="Hide" target="custom_unit_tab${t}" />
    </OnOpen>
    <OnClick>
        <RenderObject2D texture="data/textures/gui/square.tga" sizeX="60" sizeY="60" color="${xmlEsc(flagColour)}" />
${uncheckActions}
    </OnClick>
</UncheckedState>
<CheckedState acceptInput="false">
    <RenderObject2D texture="data/textures/gui/square.tga" sizeX="64" sizeY="64" color="080808cc" />
    <OnOpen>
        <Action type="SetOrigin" target="#deploy_squad_buttons" params="-8 ${setOriginY}" />
        <Action type="Show" target="custom_unit_tab${t}" />
    </OnOpen>
</CheckedState>
<StaticImage name="tab${t}_label" origin="0 0">
    <RenderObject2D texture="data/textures/gui/square.tga" sizeX="4" sizeY="4" color="${xmlEsc(flagColour)}" />
</StaticImage>
        </Checkbox>\n`;
    }
    xml += `    </Item>\n`;
  }

  // Tab content — each tab has up to 6 dolls in a 2x3 grid
  const positions = [
    { x: -101, y: 0 },
    { x: 100, y: 0 },
    { x: -101, y: -160 },
    { x: 100, y: -160 },
    { x: -101, y: -320 },
    { x: 100, y: -320 },
  ];

  const contentY = -(tabRows.length * 72);
  let slotNum = 0;

  for (let t = 0; t < tabs.length; t++) {
    const tabDolls = tabs[t];
    const hidden = t === 0 ? "false" : "true";
    xml += `\n    <Item origin="8 ${contentY}" name="custom_unit_tab${t}" align="t" hidden="${hidden}">\n`;
    for (let i = 0; i < tabDolls.length; i++) {
      xml +=
        deployClassEntry(
          tabDolls[i],
          positions[i].x,
          positions[i].y,
          178,
          slotNum++,
          flagColour,
          "t",
        ) + "\n";
    }
    xml += `    </Item>\n`;
  }
  xml += `\n</Item>\n</GUIItems>\n`;
  return xml;
}

function generateLocalisationTxt(unitName, unitId, slug) {
  return `@${unitId}-NAME=${unitName}
@${unitId}-DESC=Custom unit generated by the GFL2:DK Unit Builder.
@#${unitId}-NAME-RND=${unitName}
`;
}

function generateBindsXml(extraEquipment) {
  const binds = Object.entries(extraEquipment)
    .map(([dollId, items]) => {
      const eqpLines = items
        .map((item) => `        <eqp name="${xmlEsc(item)}" />`)
        .join("\n");
      return `    <Bind to="${xmlEsc(dollId)}">\n${eqpLines}\n    </Bind>`;
    })
    .join("\n\n");
  return `<Equipment>\n${binds}\n</Equipment>\n`;
}

function formatCategory(cat) {
  if (!cat) return "";
  const upper = cat.toUpperCase();
  if (upper === "DMR" || upper === "LMG" || upper === "SMG") return upper;
  return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

init();

// ── Roster bar rubber-band helpers ──
let rosterDragged = false;
function rosterRubber(el, offset) {
  for (const c of el.children) {
    c.style.transition = "none";
    c.style.transform = offset ? `translateX(${offset}px)` : "";
  }
}
function rosterSnapBack(el) {
  for (const c of el.children) {
    c.style.transition = "transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    c.style.transform = "";
  }
}

// ── Wheel bounce for roster bar ──
{
  let wheelBounce = 0;
  let wheelTimer = null;
  function rosterWheelBounce(el, deltaY) {
    const maxScroll = el.scrollWidth - el.clientWidth;
    const atStart = el.scrollLeft <= 0 && deltaY < 0;
    const atEnd = el.scrollLeft >= maxScroll && deltaY > 0;

    if (atStart || atEnd) {
      wheelBounce += deltaY * 0.15;
      wheelBounce = Math.max(-40, Math.min(40, wheelBounce));
      const offset = atStart ? -wheelBounce : -wheelBounce;
      rosterRubber(el, offset);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => {
        wheelBounce = 0;
        rosterSnapBack(el);
      }, 150);
    } else {
      el.scrollLeft += deltaY;
    }
  }
  window.rosterWheelBounce = rosterWheelBounce;
}

// ── Drag-to-scroll for roster bar ──
{
  const el = document.getElementById("rosterPortraits");
  let isDragging = false;
  let startX, scrollStart, totalDx, rubberOffset;
  let lastMoveX, lastMoveTime, velocity;
  let momentumAnim = null;

  el.addEventListener("mousedown", (e) => {
    isDragging = true;
    rosterDragged = false;
    totalDx = 0;
    rubberOffset = 0;
    velocity = 0;
    startX = e.pageX;
    lastMoveX = e.pageX;
    lastMoveTime = Date.now();
    scrollStart = el.scrollLeft;
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
    if (momentumAnim) cancelAnimationFrame(momentumAnim);
    rosterRubber(el, 0);
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const now = Date.now();
    const dt = now - lastMoveTime;
    if (dt > 0) {
      velocity = (e.pageX - lastMoveX) / dt;
    }
    lastMoveX = e.pageX;
    lastMoveTime = now;

    const dx = e.pageX - startX;
    totalDx = Math.abs(dx);
    if (totalDx > 4) rosterDragged = true;
    const maxScroll = el.scrollWidth - el.clientWidth;
    let target = scrollStart - dx;

    rubberOffset = 0;
    if (target < 0) {
      rubberOffset = -target * 0.3;
      target = 0;
    } else if (target > maxScroll) {
      rubberOffset = -(target - maxScroll) * 0.3;
      target = maxScroll;
    }

    el.scrollLeft = target;
    rosterRubber(el, rubberOffset);
  });

  window.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    el.style.cursor = "";
    el.style.userSelect = "";
    if (rubberOffset) {
      rosterSnapBack(el);
      return;
    }

    // Momentum coast
    const v0 = -velocity * 1000; // px/s, inverted (drag left = scroll right)
    if (Math.abs(v0) < 50) return;
    const friction = 0.95;
    let v = v0;
    function coast() {
      v *= friction;
      if (Math.abs(v) < 10) return;
      const maxScroll = el.scrollWidth - el.clientWidth;
      const next = el.scrollLeft + v * (1 / 60);

      // Bounce at edges during coast
      if (next < 0 || next > maxScroll) {
        const over = next < 0 ? next : next - maxScroll;
        rosterRubber(el, -over * 0.3);
        el.scrollLeft = Math.max(0, Math.min(next, maxScroll));
        // Snap back after brief bounce
        setTimeout(() => rosterSnapBack(el), 50);
        return;
      }

      el.scrollLeft = next;
      momentumAnim = requestAnimationFrame(coast);
    }
    momentumAnim = requestAnimationFrame(coast);
  });
}

// Show splash on load unless URL has a bitmask hash
if (!location.hash || !/^#[A-Za-z0-9\-_]+$/.test(location.hash)) {
  const div = document.createElement("div");
  div.className = "splash";
  div.id = "splash";
  div.onclick = dismissSplash;
  div.innerHTML = document.getElementById("splashTemplate").innerHTML;
  document.body.appendChild(div);
  const sv = document.getElementById("splashVersion");
  if (sv && MOD_VERSION) sv.textContent = `v${MOD_VERSION}`;
} else {
  // No splash — unlock audio on first interaction instead
  for (const evt of ["mousedown", "keydown", "touchstart"]) {
    document.addEventListener(evt, unlockAudio, { once: true });
  }
}
