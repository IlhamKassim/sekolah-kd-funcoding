"use strict";

const app = document.getElementById("app");
const appStatus = document.getElementById("app-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const PLACEHOLDER_IMAGE = "assets/tokoh/placeholder.svg";
const ERA_ACCENT_COLORS = {
  melaka: "#39e7ff",
  resistance: "#ff6b4d",
  independence: "#ffd34d",
  formation: "#6effa1",
  occupation: "#b060ff",
  modern: "#4d9dff",
  culture: "#ff6bd6",
};
const DEFAULT_ERA_ACCENT = "#39e7ff";
const PLAYTHROUGH_LENGTH = 10;
const SCORE_ANIMATION_DURATION = 400;
const TIMED_MODE_SECONDS = 12;
const DAILY_CHALLENGE_STORAGE_KEY = "tokohTekaan.dailyChallenge";
const STATS_STORAGE_KEY = "tokohTekaan.stats";

function getEraAccent(era) {
  return ERA_ACCENT_COLORS[era] || DEFAULT_ERA_ACCENT;
}

const ACHIEVEMENTS = [
  {
    id: "first-game",
    title: "First Steps",
    description: "Play your first game.",
    check: (stats) => stats.gamesPlayed >= 1,
  },
  {
    id: "perfect-run",
    title: "Perfect Run",
    description: "Answer all 10 questions correctly in one classic game.",
    check: () =>
      Boolean(lastCompletedPlaythrough && lastCompletedPlaythrough.perfectClassic),
  },
  {
    id: "streak-master",
    title: "Streak Master",
    description: "Reach a streak of 9 or more in any game.",
    check: (stats) => stats.bestStreakEver >= 9,
  },
  {
    id: "historian",
    title: "Historian",
    description: "Complete Study All mode at least once.",
    check: (stats) => stats.studyAllCompletions >= 1,
  },
  {
    id: "daily-devotee",
    title: "Daily Devotee",
    description: "Complete 3 Daily Challenges.",
    check: (stats) => stats.dailyChallengesCompleted >= 3,
  },
  {
    id: "polymath",
    title: "Polymath",
    description: "Reach 80% accuracy after at least 5 answers in every era.",
    check: (stats) => {
      if (!bank) return false;

      return Object.keys(bank.eraBuckets).every((era) => {
        const mastery = stats.eraMastery[era];
        return mastery && mastery.seen >= 5 && mastery.correct / mastery.seen >= 0.8;
      });
    },
  },
];

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

const dailyChallengeResults = new Map();

const sound = (() => {
  let context = null;
  let resumePending = null;
  let muted = false;
  let preferenceVersion = 0;
  const activeVoices = new Set();
  const patterns = {
    tap: [[0, 0.035, 850, 420, "sine", 0.025]],
    correct: [
      [0, 0.11, 659.25, 659.25, "sine", 0.085],
      [0.09, 0.16, 987.77, 987.77, "sine", 0.085],
    ],
    wrong: [[0, 0.2, 160, 65, "sawtooth", 0.035]],
    streak: [
      [0.02, 0.09, 783.99, 783.99, "triangle", 0.055],
      [0.09, 0.09, 987.77, 987.77, "triangle", 0.06],
      [0.16, 0.16, 1318.51, 1318.51, "triangle", 0.065],
    ],
    gameOver: [
      [0, 0.105, 523.25, 523.25, "triangle", 0.075],
      [0.075, 0.105, 659.25, 659.25, "triangle", 0.075],
      [0.15, 0.105, 783.99, 783.99, "triangle", 0.08],
      [0.225, 0.135, 1046.5, 1046.5, "triangle", 0.085],
    ],
  };

  function unlock(event) {
    if (muted || !event || !event.isTrusted) return;
    if (navigator.userActivation && !navigator.userActivation.isActive) return;

    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        context = new AudioContextClass();
      }

      if (context.state !== "running" && context.state !== "closed" && !resumePending) {
        resumePending = Promise.resolve(context.resume()).then(
          () => context.state === "running",
          () => false,
        );
        const pending = resumePending;
        pending.then((ready) => {
          if (resumePending === pending) resumePending = null;
        });
      }
    } catch {
      resumePending = null;
    }
  }

  function schedule(name) {
    if (
      muted ||
      !context ||
      context.state !== "running" ||
      !Object.prototype.hasOwnProperty.call(patterns, name)
    )
      return false;
    const start = context.currentTime + 0.005;

    try {
      for (const [offset, duration, from, to, type, volume] of patterns[name]) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const noteStart = start + offset;
        const noteEnd = start + offset + duration;
        const voice = { oscillator, gain };
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(from, noteStart);
        if (from !== to) oscillator.frequency.exponentialRampToValueAtTime(to, noteEnd);
        gain.gain.setValueAtTime(0, noteStart);
        gain.gain.linearRampToValueAtTime(volume, noteStart + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
        gain.gain.setValueAtTime(0, noteEnd + 0.002);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          activeVoices.delete(voice);
        };
        activeVoices.add(voice);
        oscillator.start(noteStart);
        oscillator.stop(noteEnd + 0.005);
      }
      return true;
    } catch {
      return false;
    }
  }

  function play(name) {
    if (muted || !context) return false;
    if (context.state === "running") return schedule(name);
    if (resumePending) {
      const version = preferenceVersion;
      resumePending.then((ready) => {
        if (ready && !muted && version === preferenceVersion) schedule(name);
      });
      return true;
    }
    return false;
  }

  function toggle(event) {
    muted = !muted;
    preferenceVersion += 1;
    if (muted) {
      for (const voice of activeVoices) {
        try {
          voice.gain.gain.cancelScheduledValues(context.currentTime);
          voice.gain.gain.setValueAtTime(0, context.currentTime);
          voice.oscillator.stop(context.currentTime);
        } catch {}
        voice.oscillator.disconnect();
        voice.gain.disconnect();
      }
      activeVoices.clear();
    } else {
      unlock(event);
      play("tap");
    }
  }

  return {
    unlock,
    play,
    toggle,
    get muted() {
      return muted;
    },
  };
})();

const confetti = (() => {
  const colors = ["#39e7ff", "#d94dff", "#ffd34d", "#43f58b", "#ff9d35"];
  const particles = [];
  const maxParticles = 100;
  let canvas = null;
  let context = null;
  let animationFrame = null;
  let previousTime = null;
  let resizeTimer = null;

  try {
    canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }

  function stop() {
    if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    animationFrame = null;
    previousTime = null;
    particles.length = 0;
    if (!context) return;

    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalAlpha = 1;
      context.clearRect(0, 0, canvas.width, canvas.height);
    } catch {
      context = null;
      canvas.style.display = "none";
    }
  }

  function disable() {
    stop();
    context = null;
    if (canvas) canvas.style.display = "none";
  }

  function resizeCanvas() {
    resizeTimer = null;
    if (!context) return;

    try {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    } catch {
      disable();
    }
  }

  function update(timestamp) {
    animationFrame = null;
    if (!context || reducedMotion.matches) {
      stop();
      return;
    }

    const elapsed = Math.max(0, Math.min((timestamp - previousTime) / 1000, 0.04));
    previousTime = timestamp;

    try {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (let index = particles.length - 1; index >= 0; index -= 1) {
        const particle = particles[index];
        const age = Math.max(0, (timestamp - particle.createdAt) / 1000);
        particle.velocityX += particle.drift * elapsed;
        particle.velocityY += 600 * elapsed;
        particle.x += particle.velocityX * elapsed;
        particle.y += particle.velocityY * elapsed;
        particle.rotation += particle.rotationSpeed * elapsed;

        if (
          age >= particle.lifetime ||
          particle.x < -particle.size ||
          particle.x > canvas.width + particle.size ||
          particle.y > canvas.height + particle.size
        ) {
          particles.splice(index, 1);
          continue;
        }

        const cosine = Math.cos(particle.rotation);
        const sine = Math.sin(particle.rotation);
        context.setTransform(cosine, sine, -sine, cosine, particle.x, particle.y);
        context.globalAlpha = 1 - age / particle.lifetime;
        context.fillStyle = particle.color;
        context.fillRect(
          -particle.size / 2,
          -particle.size / 3,
          particle.size,
          particle.size * 2 / 3,
        );
      }

      if (particles.length > 0) animationFrame = window.requestAnimationFrame(update);
      else stop();
    } catch {
      disable();
    }
  }

  function burst({ particleCount = 50, spread = 260, originY = 0.35, duration = 1.6 } = {}) {
    if (!context || reducedMotion.matches) return;
    if (![particleCount, spread, originY, duration].every(Number.isFinite)) return;
    const count = Math.max(0, Math.min(maxParticles, Math.floor(particleCount)));
    if (count === 0) return;
    const velocitySpread = Math.max(0, Math.min(1000, spread));
    const startY = canvas.height * Math.max(0, Math.min(1, originY));
    const lifetime = Math.max(0.2, Math.min(3, duration));

    try {
      const now = performance.now();
      // Replace the oldest particles when bursts overlap instead of growing the list.
      particles.splice(0, Math.max(0, particles.length + count - maxParticles));
      for (let index = 0; index < count; index += 1) {
        particles.push({
          x: canvas.width / 2,
          y: startY,
          velocityX: (Math.random() - 0.5) * velocitySpread,
          velocityY: -(120 + Math.random() * 180),
          drift: (Math.random() - 0.5) * 24,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 10,
          size: 4 + Math.floor(Math.random() * 5),
          color: colors[Math.floor(Math.random() * colors.length)],
          createdAt: now,
          lifetime: lifetime * (0.8 + Math.random() * 0.2),
        });
      }
      if (animationFrame === null) {
        previousTime = now;
        animationFrame = window.requestAnimationFrame(update);
      }
    } catch {
      disable();
    }
  }

  function updateMotionPreference() {
    if (reducedMotion.matches) stop();
  }

  if (context) {
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(resizeCanvas, 100);
    });
    canvas.addEventListener("contextlost", disable);
    if (typeof reducedMotion.addEventListener === "function") {
      reducedMotion.addEventListener("change", updateMotionPreference);
    } else if (typeof reducedMotion.addListener === "function") {
      reducedMotion.addListener(updateMotionPreference);
    }
  }

  return { burst };
})();

const soundToggle = document.createElement("button");
soundToggle.id = "sound-toggle";
soundToggle.className = "sound-toggle";
soundToggle.type = "button";
soundToggle.setAttribute("aria-label", "Mute sound");

function updateSoundToggle() {
  soundToggle.textContent = sound.muted ? "🔇" : "🔊";
  soundToggle.setAttribute("aria-pressed", String(sound.muted));
  soundToggle.title = sound.muted ? "Sound: Off — unmute" : "Sound: On — mute";
}

updateSoundToggle();
document.body.appendChild(soundToggle);
soundToggle.addEventListener("click", (event) => {
  sound.toggle(event);
  updateSoundToggle();
});

let bank = null;
let lastRenderedGuessScore = null;
let scoreAnimationFrame = null;
let dailyChallengeRefreshTimer = null;
let lastCompletedPlaythrough = null;
let timedModeInterval = null;
let timedModeTimeout = null;
let timedModeQuestionToken = 0;
// Absolute deadline (Date.now()-based) for the current question's countdown.
// Kept separate from the timer DOM/interval so a hint reveal — which re-renders
// the guess screen and destroys the old timer elements — can resync the display
// to the true remaining time instead of granting extra time.
let timedModeDeadline = null;

const state = {
  questions: [],
  questionIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  correctAnswers: 0,
  hintsShown: 1,
  tier: 3,
  choices: [],
  locked: false,
  lastResult: null,
  studyAll: false,
  dailyChallenge: false,
  dailyChallengeDate: null,
  eraPractice: null,
  timedMode: false,
  completionRecorded: false,
  newAchievements: [],
  browseExpandedId: null,
};

function createDefaultStats() {
  return {
    gamesPlayed: 0,
    totalCorrect: 0,
    totalAnswered: 0,
    bestScoreClassic: 0,
    bestStreakEver: 0,
    dailyChallengesCompleted: 0,
    studyAllCompletions: 0,
    eraMastery: {},
    unlockedAchievements: [],
  };
}

function getNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeStats(saved) {
  const defaults = createDefaultStats();
  if (!saved || typeof saved !== "object") return defaults;

  const eraMastery = {};
  if (saved.eraMastery && typeof saved.eraMastery === "object") {
    for (const [era, mastery] of Object.entries(saved.eraMastery)) {
      if (!mastery || typeof mastery !== "object") continue;
      eraMastery[era] = {
        seen: getNonNegativeInteger(mastery.seen),
        correct: Math.min(
          getNonNegativeInteger(mastery.correct),
          getNonNegativeInteger(mastery.seen),
        ),
      };
    }
  }

  return {
    gamesPlayed: getNonNegativeInteger(saved.gamesPlayed),
    totalCorrect: getNonNegativeInteger(saved.totalCorrect),
    totalAnswered: getNonNegativeInteger(saved.totalAnswered),
    bestScoreClassic: getNonNegativeInteger(saved.bestScoreClassic),
    bestStreakEver: getNonNegativeInteger(saved.bestStreakEver),
    dailyChallengesCompleted: getNonNegativeInteger(saved.dailyChallengesCompleted),
    studyAllCompletions: getNonNegativeInteger(saved.studyAllCompletions),
    eraMastery,
    unlockedAchievements: Array.isArray(saved.unlockedAchievements)
      ? [...new Set(saved.unlockedAchievements.filter((id) => typeof id === "string"))]
      : defaults.unlockedAchievements,
  };
}

function getStats() {
  try {
    return normalizeStats(JSON.parse(window.localStorage.getItem(STATS_STORAGE_KEY)));
  } catch {
    return createDefaultStats();
  }
}

let stats = getStats();

function saveStats() {
  try {
    window.localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // The in-memory stats remain available for this page session.
  }
}

function unlockAchievements() {
  const unlocked = new Set(stats.unlockedAchievements);
  const newlyUnlocked = [];

  for (const achievement of ACHIEVEMENTS) {
    if (!unlocked.has(achievement.id) && achievement.check(stats)) {
      unlocked.add(achievement.id);
      newlyUnlocked.push(achievement);
    }
  }

  stats.unlockedAchievements = [...unlocked];
  return newlyUnlocked;
}

function addNewAchievements(achievements) {
  for (const achievement of achievements) {
    if (!state.newAchievements.some((item) => item.id === achievement.id)) {
      state.newAchievements.push(achievement);
    }
  }
}

function recordAnswerStats(tokoh, isCorrect) {
  stats.totalAnswered += 1;
  if (isCorrect) stats.totalCorrect += 1;

  if (!stats.eraMastery[tokoh.era]) {
    stats.eraMastery[tokoh.era] = { seen: 0, correct: 0 };
  }

  stats.eraMastery[tokoh.era].seen += 1;
  if (isCorrect) stats.eraMastery[tokoh.era].correct += 1;

  addNewAchievements(unlockAchievements());
  saveStats();
}

function recordCompletedPlaythrough() {
  if (state.completionRecorded) return;
  state.completionRecorded = true;

  const dailyAlreadyCompleted =
    state.dailyChallenge && Boolean(getDailyChallengeResult(state.dailyChallengeDate));

  lastCompletedPlaythrough = {
    perfectClassic:
      !state.studyAll &&
      !state.dailyChallenge &&
      !state.eraPractice &&
      !state.timedMode &&
      state.questions.length === PLAYTHROUGH_LENGTH &&
      state.correctAnswers === PLAYTHROUGH_LENGTH,
  };

  stats.gamesPlayed += 1;
  stats.bestStreakEver = Math.max(stats.bestStreakEver, state.bestStreak);

  if (!state.studyAll && !state.dailyChallenge && !state.eraPractice && !state.timedMode) {
    stats.bestScoreClassic = Math.max(stats.bestScoreClassic, state.score);
  }

  if (state.studyAll) stats.studyAllCompletions += 1;
  if (state.dailyChallenge && !dailyAlreadyCompleted) {
    stats.dailyChallengesCompleted += 1;
  }

  addNewAchievements(unlockAchievements());
  saveStats();

  if (state.dailyChallenge && !dailyAlreadyCompleted) {
    saveDailyChallengeResult();
  }
}

const pointerTappedButtons = new WeakSet();

function isInactive(button) {
  return button.disabled || button.getAttribute("aria-disabled") === "true";
}

function clearTimedModeTimer() {
  window.clearInterval(timedModeInterval);
  window.clearTimeout(timedModeTimeout);
  timedModeInterval = null;
  timedModeTimeout = null;
  timedModeQuestionToken += 1;
  timedModeDeadline = null;
  const timerFill = document.getElementById("timer-fill");
  if (timerFill) timerFill.classList.remove("is-running");
}

// Starts a brand-new 12-second countdown for a freshly rendered question.
function startTimedModeTimer() {
  clearTimedModeTimer();
  if (!state.timedMode) return;
  timedModeDeadline = Date.now() + TIMED_MODE_SECONDS * 1000;
  armTimedModeTimer();
}

// Re-renders (e.g. a hint reveal) destroy and recreate the timer DOM nodes and
// their interval closures, but must never grant extra time. This repaints the
// bar/number from the existing deadline and rearms the interval/timeout
// against the same fixed deadline, without pushing it back.
function resyncTimedModeTimer() {
  if (!state.timedMode || timedModeDeadline === null) return;
  armTimedModeTimer();
}

function armTimedModeTimer() {
  window.clearInterval(timedModeInterval);
  window.clearTimeout(timedModeTimeout);
  timedModeInterval = null;
  timedModeTimeout = null;
  if (!state.timedMode || timedModeDeadline === null) return;

  const timerFill = document.getElementById("timer-fill");
  const timerNumber = document.getElementById("timer-number");
  if (!timerFill || !timerNumber) return;

  const questionToken = timedModeQuestionToken;
  const remainingSeconds = Math.max(0, (timedModeDeadline - Date.now()) / 1000);

  timerNumber.textContent = String(Math.ceil(remainingSeconds));
  timerFill.classList.remove("is-running");
  void timerFill.offsetWidth;
  timerFill.style.animationDuration = `${remainingSeconds}s`;
  timerFill.classList.add("is-running");

  timedModeInterval = window.setInterval(() => {
    if (questionToken !== timedModeQuestionToken || timedModeDeadline === null) return;
    const secondsRemaining = Math.max(
      0,
      Math.ceil((timedModeDeadline - Date.now()) / 1000),
    );
    if (timerNumber.isConnected) timerNumber.textContent = String(secondsRemaining);
  }, 250);

  timedModeTimeout = window.setTimeout(() => {
    if (questionToken !== timedModeQuestionToken) return;
    handleTimedOut();
  }, Math.max(0, timedModeDeadline - Date.now()));
}

function handleTimedOut() {
  if (state.locked) return;
  appStatus.textContent = "Time's up.";
  submitGuess();
}

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("button");
  if (!button || isInactive(button)) return;
  pointerTappedButtons.delete(button);
  if (event.isTrusted && !sound.muted) {
    sound.unlock(event);
    if (sound.play("tap")) pointerTappedButtons.add(button);
  }
  if (reducedMotion.matches) return;
  button.classList.remove("is-pressed");
  void button.offsetWidth;
  button.classList.add("is-pressed");
  window.setTimeout(() => button.classList.remove("is-pressed"), 140);
});

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest("button");
    if (!button || isInactive(button) || !event.isTrusted) return;
    const alreadyTapped = pointerTappedButtons.has(button);
    pointerTappedButtons.delete(button);
    if (sound.muted) return;
    sound.unlock(event);
    if (event.detail === 0 || !alreadyTapped) sound.play("tap");
  },
  true,
);

window.addEventListener("storage", (event) => {
  if (event.key === DAILY_CHALLENGE_STORAGE_KEY || event.key === null)
    updateDailyChallengeButton();
  if (event.key === STATS_STORAGE_KEY || event.key === null) stats = getStats();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") updateDailyChallengeButton();
});

loadBank();

function focusView(selector = "h1") {
  const target = app.querySelector(selector);
  if (!target) return;
  if (!target.matches("button")) target.tabIndex = -1;
  target.focus();
}

async function loadBank() {
  const restoreFocus = app.contains(document.activeElement);
  renderLoading();
  appStatus.textContent = "Loading tokoh bank...";
  if (restoreFocus) focusView();

  try {
    const response = await fetch("bank.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    validateBank(data);
    bank = data;
    renderStart(restoreFocus);
  } catch (error) {
    console.error("Failed to load bank.json:", error);
    renderLoadError(restoreFocus);
  }
}

function validateBank(data) {
  const validEras = data && data.eraBuckets ? Object.keys(data.eraBuckets) : [];
  if (
    !data ||
    typeof data !== "object" ||
    !data.eraBuckets ||
    !Array.isArray(data.tokoh) ||
    data.tokoh.length < PLAYTHROUGH_LENGTH
  ) {
    throw new Error("Invalid bank.json structure.");
  }

  const ids = new Set();
  for (const tokoh of data.tokoh) {
    const valid =
      tokoh &&
      typeof tokoh.id === "string" &&
      tokoh.id.length > 0 &&
      typeof tokoh.name === "string" &&
      tokoh.name.length > 0 &&
      validEras.includes(tokoh.era) &&
      Array.isArray(tokoh.hints) &&
      tokoh.hints.length === 3 &&
      tokoh.hints.every((hint) => typeof hint === "string") &&
      typeof tokoh.summary === "string" &&
      typeof tokoh.image === "string";
    if (!valid || ids.has(tokoh.id))
      throw new Error("Invalid tokoh record in bank.json.");
    ids.add(tokoh.id);
  }
}

function renderLoading() {
  app.innerHTML = `<section class="panel loading-panel"><h1 class="game-title">Tokoh Tekaan</h1><p class="status-message">Loading tokoh bank...</p></section>`;
}

function renderLoadError(restoreFocus = false) {
  app.innerHTML = `<section class="screen"><div class="panel panel-magenta"><h1 class="game-title">Tokoh Tekaan</h1><h2 class="screen-header">Data Error</h2><p class="status-message">The tokoh bank could not be loaded. Check your connection and try again. If the problem persists, make sure <strong>bank.json</strong> is available and the page is opened over HTTP or HTTPS.</p><button id="retry-button" class="button button-primary" type="button">Try again</button></div></section>`;
  document.getElementById("retry-button").addEventListener("click", loadBank);
  appStatus.textContent = restoreFocus
    ? ""
    : "The tokoh bank could not be loaded. Try again.";
  if (restoreFocus) focusView(".screen-header");
}

function getUTCDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getDailyChallengeResult(date) {
  if (dailyChallengeResults.has(date)) return dailyChallengeResults.get(date);
  try {
    const result = JSON.parse(window.localStorage.getItem(DAILY_CHALLENGE_STORAGE_KEY));
    if (
      result &&
      result.date === date &&
      Number.isInteger(result.score) &&
      result.score >= 0 &&
      Number.isInteger(result.bestStreak) &&
      result.bestStreak >= 0
    ) {
      dailyChallengeResults.set(date, result);
      return result;
    }
  } catch {}
  return null;
}

function saveDailyChallengeResult() {
  const result = {
    date: state.dailyChallengeDate,
    score: state.score,
    bestStreak: state.bestStreak,
  };
  dailyChallengeResults.set(result.date, result);
  try {
    window.localStorage.setItem(DAILY_CHALLENGE_STORAGE_KEY, JSON.stringify(result));
  } catch {}
}

function updateDailyChallengeButton() {
  window.clearTimeout(dailyChallengeRefreshTimer);
  dailyChallengeRefreshTimer = null;
  const button = document.getElementById("daily-challenge-button");
  if (!button) return;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const result = getDailyChallengeResult(date);
  button.disabled = Boolean(result);
  button.textContent = result
    ? `Today: ${result.score} pts — come back tomorrow`
    : "Daily Challenge";
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  dailyChallengeRefreshTimer = window.setTimeout(
    updateDailyChallengeButton,
    nextMidnight.getTime() - now.getTime() + 50,
  );
}

function renderStart(restoreFocus = false) {
  clearTimedModeTimer();
  state.dailyChallenge = false;
  state.dailyChallengeDate = null;
  state.eraPractice = null;
  state.timedMode = false;
  app.innerHTML = `<section class="screen"><div class="panel panel-magenta"><h1 class="game-title">Tokoh Tekaan</h1><p class="intro-copy">Identify 10 historical figures from their hints. Answer early for more points, and build a streak for double points.</p><button id="start-button" class="button button-primary" type="button">Start playing</button><button id="study-all-button" class="button button-secondary" type="button">Study all ${bank.tokoh.length} tokoh</button><button id="era-practice-button" class="button button-secondary" type="button">Practice an Era</button><button id="timed-mode-button" class="button button-secondary" type="button">Timed Mode</button><button id="daily-challenge-button" class="button button-secondary" type="button">Daily Challenge</button><button id="stats-button" class="button button-secondary" type="button">Stats &amp; Achievements</button><button id="browse-button" class="button button-secondary" type="button">Browse Tokoh</button></div></section>`;
  document.getElementById("start-button").addEventListener("click", () => startGame());
  document
    .getElementById("study-all-button")
    .addEventListener("click", () => startGame(true));
  document
    .getElementById("era-practice-button")
    .addEventListener("click", renderEraSelect);
  document
    .getElementById("timed-mode-button")
    .addEventListener("click", () => startGame(false, false, null, true));
  document
    .getElementById("daily-challenge-button")
    .addEventListener("click", () => startGame(false, true));
  document.getElementById("stats-button").addEventListener("click", renderStats);
  document.getElementById("browse-button").addEventListener("click", renderBrowse);
  updateDailyChallengeButton();
  appStatus.textContent = restoreFocus ? "" : "Tokoh bank loaded. Ready to play.";
  if (restoreFocus) focusView();
}

function renderEraSelect() {
  clearTimedModeTimer();
  const eraRows = Object.entries(bank.eraBuckets).map(([id, label]) => ({
    id,
    label,
    count: bank.tokoh.filter((tokoh) => tokoh.era === id).length,
  }));

  app.innerHTML = `<section class="screen"><div class="panel panel-magenta era-select-panel"><h1 class="screen-header">Practice an Era</h1><p class="era-select-copy">Choose an era to practice.</p><div class="era-list">${eraRows.map((era) => `<button class="button button-secondary era-button" type="button" data-era-id="${escapeAttribute(era.id)}" style="--era-accent: ${getEraAccent(era.id)};"><span class="era-button-label">${escapeHTML(era.label)}</span><span class="era-button-count">${era.count} tokoh</span></button>`).join("")}</div><button id="era-back-button" class="button button-link" type="button">Back</button></div></section>`;
  document.querySelectorAll(".era-button").forEach((button) =>
    button.addEventListener("click", () =>
      startGame(false, false, button.dataset.eraId),
    ),
  );
  document
    .getElementById("era-back-button")
    .addEventListener("click", () => renderStart(true));
  appStatus.textContent = "Choose an era to practice.";
  focusView();
}

// Truncates before escaping so a truncated entity is never split mid-escape.
function getBrowseExcerpt(summary, length = 90) {
  if (summary.length <= length) return summary;
  return `${summary.slice(0, length).trimEnd()}…`;
}

function renderBrowse() {
  clearTimedModeTimer();
  state.browseExpandedId = null;
  app.innerHTML = `<section class="screen"><div class="panel panel-magenta browse-panel"><h1 class="screen-header">Browse Tokoh</h1><p class="browse-copy">Search the tokoh bank directly. This is a reference screen, not a quiz.</p><div class="browse-search-wrap"><label class="browse-label" for="browse-search">Search by name</label><input id="browse-search" class="browse-search" type="search" autocomplete="off" spellcheck="false" placeholder="Type a tokoh name"></div><div class="browse-era-filter" role="group" aria-label="Filter by era"><button class="browse-era-pill is-active" type="button" data-era-id="all" aria-pressed="true">All</button>${Object.entries(bank.eraBuckets).map(([id, label]) => `<button class="browse-era-pill" type="button" data-era-id="${escapeAttribute(id)}" aria-pressed="false" style="--era-accent: ${getEraAccent(id)};">${escapeHTML(label)}</button>`).join("")}</div><div id="browse-results" class="browse-results" aria-live="polite"></div><button id="browse-back-button" class="button button-link" type="button">Back</button></div></section>`;

  const searchInput = document.getElementById("browse-search");
  const results = document.getElementById("browse-results");
  let activeEra = "all";

  function updateResults() {
    renderBrowseResults(searchInput.value, activeEra);
  }

  searchInput.addEventListener("input", updateResults);

  document.querySelectorAll(".browse-era-pill").forEach((button) => {
    button.addEventListener("click", () => {
      activeEra = button.dataset.eraId;
      state.browseExpandedId = null;
      document.querySelectorAll(".browse-era-pill").forEach((pill) => {
        const selected = pill === button;
        pill.classList.toggle("is-active", selected);
        pill.setAttribute("aria-pressed", String(selected));
      });
      updateResults();
    });
  });

  // Delegated on the stable results container so re-rendering the list on
  // every keystroke never loses or duplicates the click handler.
  results.addEventListener("click", (event) => {
    const button = event.target.closest(".browse-card-header");
    if (!button) return;
    state.browseExpandedId =
      state.browseExpandedId === button.dataset.tokohId ? null : button.dataset.tokohId;
    updateResults();
  });

  document.getElementById("browse-back-button").addEventListener("click", () => renderStart(true));

  updateResults();
  appStatus.textContent = "Browse tokoh reference.";
  focusView();
}

function renderBrowseResults(query, era) {
  const results = document.getElementById("browse-results");
  if (!results) return;

  const search = query.trim().toLocaleLowerCase();
  const matchingTokoh = bank.tokoh.filter(
    (tokoh) =>
      (era === "all" || tokoh.era === era) &&
      (!search || tokoh.name.toLocaleLowerCase().includes(search)),
  );

  if (
    state.browseExpandedId &&
    !matchingTokoh.some((tokoh) => tokoh.id === state.browseExpandedId)
  ) {
    state.browseExpandedId = null;
  }

  if (matchingTokoh.length === 0) {
    results.innerHTML = `<p class="browse-empty">No tokoh match your search.</p>`;
    return;
  }

  results.innerHTML = matchingTokoh
    .map((tokoh) => {
      const expanded = tokoh.id === state.browseExpandedId;
      const usingPlaceholder = !tokoh.image || tokoh.image === PLACEHOLDER_IMAGE;
      return `<article class="browse-card ${expanded ? "is-expanded" : ""}"><button class="browse-card-header" type="button" data-tokoh-id="${escapeAttribute(tokoh.id)}" aria-expanded="${expanded}"><span class="era-tag" style="--era-accent: ${getEraAccent(tokoh.era)};">${escapeHTML(bank.eraBuckets[tokoh.era])}</span><span class="browse-card-text"><strong>${escapeHTML(tokoh.name)}</strong><small>${escapeHTML(getBrowseExcerpt(tokoh.summary))}</small></span><span class="browse-card-indicator" aria-hidden="true">${expanded ? "−" : "+"}</span></button>${expanded ? `<div class="browse-card-detail"><div class="portrait-frame"><img id="browse-tokoh-image" src="${escapeAttribute(tokoh.image || PLACEHOLDER_IMAGE)}" alt="${usingPlaceholder ? "Portrait unavailable for" : "Portrait of"} ${escapeAttribute(tokoh.name)}"></div><p class="summary">${escapeHTML(tokoh.summary)}</p></div>` : ""}</article>`;
    })
    .join("");

  setupBrowseImageFallback();
}

function setupBrowseImageFallback() {
  const image = document.getElementById("browse-tokoh-image");
  if (!image) return;

  let usingPlaceholder = image.getAttribute("src") === PLACEHOLDER_IMAGE;

  image.addEventListener("error", () => {
    const name = image.alt
      .replace("Portrait of ", "")
      .replace("Portrait unavailable for ", "");
    image.alt = `Portrait unavailable for ${name}`;

    if (!usingPlaceholder) {
      usingPlaceholder = true;
      image.src = PLACEHOLDER_IMAGE;
    }
  });
}

function renderStats() {
  clearTimedModeTimer();
  stats = getStats();
  const totalAccuracy = stats.totalAnswered
    ? Math.round((stats.totalCorrect / stats.totalAnswered) * 100)
    : 0;
  const eraRows = Object.entries(bank.eraBuckets)
    .map(([id, label]) => {
      const mastery = stats.eraMastery[id] || { seen: 0, correct: 0 };
      const accuracy = mastery.seen
        ? Math.round((mastery.correct / mastery.seen) * 100)
        : 0;
      return { id, label, seen: mastery.seen, accuracy };
    })
    .sort(
      (a, b) =>
        b.accuracy - a.accuracy || b.seen - a.seen || a.label.localeCompare(b.label),
    );
  const unlocked = new Set(stats.unlockedAchievements);

  app.innerHTML = `<section class="screen"><div class="panel panel-magenta stats-panel"><h1 class="screen-header">Stats &amp; Achievements</h1>${stats.gamesPlayed === 0 ? `<p class="status-message stats-empty">Play a round to start tracking your stats.</p>` : `<div class="stats-summary" aria-label="Game statistics"><div class="stats-item"><span>Games played</span><strong>${stats.gamesPlayed}</strong></div><div class="stats-item"><span>Total accuracy</span><strong>${totalAccuracy}%</strong><small>${stats.totalCorrect}/${stats.totalAnswered} correct</small></div><div class="stats-item"><span>Best classic score</span><strong>${stats.bestScoreClassic}</strong></div><div class="stats-item"><span>Best streak ever</span><strong>${stats.bestStreakEver}</strong></div></div><section class="era-mastery" aria-labelledby="era-mastery-heading"><h2 id="era-mastery-heading" class="stats-section-heading">Era mastery</h2>${eraRows.map((era) => `<div class="era-bar-row"><div class="era-bar-label"><span>${escapeHTML(era.label)}</span><span>${era.accuracy}% · ${era.seen} seen</span></div><div class="era-bar-track" role="progressbar" aria-label="${escapeAttribute(era.label)} accuracy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${era.accuracy}" aria-valuetext="${era.accuracy}% accuracy from ${era.seen} answers"><div class="era-bar-fill" style="--era-accent: ${getEraAccent(era.id)}; width: ${era.accuracy}%"></div></div></div>`).join("")}</section>`}<section class="achievements" aria-labelledby="achievements-heading"><h2 id="achievements-heading" class="stats-section-heading">Achievements</h2><div class="achievement-grid">${ACHIEVEMENTS.map(
    (achievement) => {
      const isUnlocked = unlocked.has(achievement.id);
      return `<article class="achievement-badge ${isUnlocked ? "is-unlocked" : "is-locked"}" aria-label="${escapeAttribute(`${achievement.title}: ${isUnlocked ? "unlocked" : "locked"}. ${achievement.description}`)}"><span class="achievement-icon" aria-hidden="true">${isUnlocked ? "✓" : "🔒"}</span><h3>${escapeHTML(achievement.title)}</h3><p>${escapeHTML(achievement.description)}</p></article>`;
    },
  ).join(
    "",
  )}</div></section><button id="stats-back-button" class="button button-link" type="button">Back</button></div></section>`;
  document
    .getElementById("stats-back-button")
    .addEventListener("click", () => renderStart(true));
  appStatus.textContent = "Stats and achievements.";
  focusView();
}

function startGame(studyAll = false, dailyChallenge = false, eraPractice = null, timedMode = false) {
  const validEraPractice =
    typeof eraPractice === "string" &&
    Object.prototype.hasOwnProperty.call(bank.eraBuckets, eraPractice)
      ? eraPractice
      : null;
  const dailyChallengeDate = dailyChallenge ? getUTCDateString() : null;
  if (dailyChallenge && getDailyChallengeResult(dailyChallengeDate)) {
    renderStart(true);
    return;
  }
  if (dailyChallenge) {
    studyAll = false;
    eraPractice = null;
    timedMode = false;
  } else eraPractice = validEraPractice;
  if (eraPractice) {
    studyAll = false;
    timedMode = false;
  }
  if (studyAll) timedMode = false;
  if (timedMode) {
    studyAll = false;
    dailyChallenge = false;
    eraPractice = null;
  }
  clearTimedModeTimer();
  window.clearTimeout(dailyChallengeRefreshTimer);
  dailyChallengeRefreshTimer = null;
  state.questions = dailyChallenge
    ? getDailyChallengeQuestions(dailyChallengeDate)
    : eraPractice
      ? shuffle(bank.tokoh.filter((tokoh) => tokoh.era === eraPractice))
      : shuffle([...bank.tokoh]).slice(
          0,
          studyAll ? bank.tokoh.length : PLAYTHROUGH_LENGTH,
        );
  if (eraPractice && state.questions.length === 0) {
    renderEraSelect();
    return;
  }
  state.questionIndex = 0;
  state.score = 0;
  state.streak = 0;
  state.bestStreak = 0;
  state.correctAnswers = 0;
  state.lastResult = null;
  state.studyAll = studyAll;
  state.dailyChallenge = dailyChallenge;
  state.dailyChallengeDate = dailyChallengeDate;
  state.eraPractice = eraPractice;
  state.timedMode = timedMode;
  state.completionRecorded = false;
  state.newAchievements = [];
  prepareQuestion();
  renderGuess();
}

function prepareQuestion() {
  clearTimedModeTimer();
  state.hintsShown = 1;
  state.tier = 3;
  state.locked = false;
  state.lastResult = null;
  state.choices = createChoices(currentTokoh());
}

function currentTokoh() {
  return state.questions[state.questionIndex];
}

function createChoices(correctTokoh) {
  const sameEraOthers = shuffle(
    bank.tokoh.filter(
      (tokoh) => tokoh.era === correctTokoh.era && tokoh.id !== correctTokoh.id,
    ),
  );
  const distractors = sameEraOthers.slice(0, 3);
  if (distractors.length < 3) {
    const usedIds = new Set([correctTokoh.id, ...distractors.map((tokoh) => tokoh.id)]);
    const fillerPool = shuffle(bank.tokoh.filter((tokoh) => !usedIds.has(tokoh.id)));
    while (distractors.length < 3 && fillerPool.length > 0)
      distractors.push(fillerPool.shift());
  }
  return shuffle([correctTokoh, ...distractors]);
}

function getStreakTierClass(streak) {
  if (streak >= 9) return "streak-tier-3";
  if (streak >= 6) return "streak-tier-2";
  if (streak >= 3) return "streak-tier-1";
  return "";
}

function applyStreakTier(panel) {
  panel.classList.remove("streak-tier-1", "streak-tier-2", "streak-tier-3");
  const tierClass = getStreakTierClass(state.streak);
  if (tierClass) panel.classList.add(tierClass);
}

function animateScoreCount(element, from, to) {
  let startTime = null;
  function update(timestamp) {
    if (!element.isConnected) {
      scoreAnimationFrame = null;
      return;
    }
    if (reducedMotion.matches) {
      element.textContent = String(to);
      scoreAnimationFrame = null;
      return;
    }
    if (startTime === null) startTime = timestamp;
    const progress = Math.min((timestamp - startTime) / SCORE_ANIMATION_DURATION, 1);
    element.textContent = String(Math.round(from + (to - from) * progress));
    if (progress < 1) scoreAnimationFrame = window.requestAnimationFrame(update);
    else {
      element.textContent = String(to);
      scoreAnimationFrame = null;
    }
  }
  scoreAnimationFrame = window.requestAnimationFrame(update);
}

function renderGuess({ hintUpdate = false } = {}) {
  const tokoh = currentTokoh();
  const number = state.questionIndex + 1;
  const total = state.questions.length;
  const progress = (number / total) * 100;
  const previousScore = lastRenderedGuessScore;
  const shouldAnimateScore =
    previousScore !== null && state.score > previousScore && !reducedMotion.matches;
  const displayedScore = shouldAnimateScore ? previousScore : state.score;
  const streakTierClass = getStreakTierClass(state.streak);
  if (scoreAnimationFrame !== null) {
    window.cancelAnimationFrame(scoreAnimationFrame);
    scoreAnimationFrame = null;
  }
  lastRenderedGuessScore = state.score;
  appStatus.textContent = "";
  app.innerHTML = `<section class="screen"><div id="guess-panel" class="panel guess-panel ${streakTierClass}"><div class="topbar"><span class="progress-label">Tokoh ${number}/${total}</span><span class="score-chip">Score: <span id="guess-score-number">${displayedScore}</span></span></div><div class="progress-track" role="progressbar" aria-label="Game progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${number}" aria-valuetext="Tokoh ${number} of ${total}"><div class="progress-fill" style="width: ${progress}%"></div></div>${state.timedMode ? `<div class="timer-wrap"><div class="timer-label-row"><span class="timer-label">Time left</span><span id="timer-number" class="timer-number" aria-live="off">${TIMED_MODE_SECONDS}</span></div><div class="timer-track" aria-hidden="true"><div id="timer-fill" class="timer-fill"></div></div></div>` : ""}<h1 class="screen-header"><span class="sr-only">Tokoh ${number} of ${total}. </span>Who Is This Tokoh?</h1><div class="guess-meta"><div class="tier-chip">Worth: ${state.tier} pts</div><div class="streak-box"><span class="streak-label">Streak</span><span id="streak-number" class="streak-number">${state.streak}</span></div></div><div id="hints" class="hints">${renderHints(tokoh)}</div><button id="hint-button" class="button button-secondary" type="button" aria-controls="hints" ${state.hintsShown >= 3 || state.locked ? "disabled hidden" : ""}>Reveal next hint</button><div class="answer-grid" role="group" aria-label="Answer choices">${state.choices.map((choice) => `<button class="button answer-button" type="button" data-tokoh-id="${escapeAttribute(choice.id)}" ${state.locked ? "disabled" : ""}>${escapeHTML(choice.name)}</button>`).join("")}</div></div></section>`;
  const hintButton = document.getElementById("hint-button");
  if (hintButton) hintButton.addEventListener("click", revealNextHint);
  document
    .querySelectorAll(".answer-button")
    .forEach((button) => button.addEventListener("click", () => submitGuess(button)));
  if (shouldAnimateScore)
    animateScoreCount(
      document.getElementById("guess-score-number"),
      previousScore,
      state.score,
    );
  if (state.timedMode) {
    // A hint reveal re-renders this screen but must not grant extra time.
    if (hintUpdate) resyncTimedModeTimer();
    else startTimedModeTimer();
  }
  if (hintUpdate) {
    focusView("#hint-button:not([hidden]):enabled, .answer-button:enabled");
    appStatus.textContent = `Hint ${state.hintsShown}: ${tokoh.hints[state.hintsShown - 1]} Worth ${state.tier} ${state.tier === 1 ? "point" : "points"}.`;
  } else focusView();
}

function renderHints(tokoh) {
  return tokoh.hints
    .slice(0, state.hintsShown)
    .map(
      (hint, index) =>
        `<article class="hint-card" style="animation-delay: ${index * 70}ms"><span class="hint-label">Hint ${index + 1}</span><p class="hint-text">${escapeHTML(hint)}</p></article>`,
    )
    .join("");
}

function revealNextHint() {
  if (state.locked || state.hintsShown >= 3) return;
  state.hintsShown += 1;
  state.tier = 4 - state.hintsShown;
  renderGuess({ hintUpdate: true });
}

function submitGuess(selectedButton) {
  if (state.locked) return;
  clearTimedModeTimer();
  state.locked = true;
  const correct = currentTokoh();
  const selectedId = selectedButton ? selectedButton.dataset.tokohId : null;
  const isCorrect = selectedId === correct.id;
  const basePoints = state.tier;
  const previousStreak = state.streak;
  let awardedPoints = 0;
  if (isCorrect) {
    state.streak += 1;
    state.correctAnswers += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    awardedPoints = state.streak >= 3 ? basePoints * 2 : basePoints;
    state.score += awardedPoints;
  } else state.streak = 0;
  recordAnswerStats(correct, isCorrect);
  sound.play(isCorrect ? "correct" : "wrong");
  if (isCorrect && state.streak >= 3) sound.play("streak");
  state.lastResult = { isCorrect, selectedId, basePoints, awardedPoints };
  const panel = document.getElementById("guess-panel");
  const hintButton = document.getElementById("hint-button");
  const streakNumber = document.getElementById("streak-number");
  const allButtons = document.querySelectorAll(".answer-button");
  applyStreakTier(panel);
  if (
    isCorrect &&
    state.streak > previousStreak &&
    [3, 6, 9].includes(state.streak)
  ) {
    confetti.burst({ particleCount: 16, spread: 140, originY: 0.4, duration: 0.75 });
  }
  if (hintButton) {
    hintButton.disabled = true;
    hintButton.hidden = true;
  }
  allButtons.forEach((button) => {
    button.disabled = true;
    if (button.dataset.tokohId === correct.id) button.classList.add("is-correct");
  });
  if (isCorrect) {
    panel.classList.add("flash-right");
    streakNumber.textContent = String(state.streak);
    streakNumber.classList.add("streak-pop");
  } else {
    if (selectedButton) selectedButton.classList.add("is-wrong");
    panel.classList.add("flash-wrong");
    streakNumber.textContent = "0";
  }
  window.setTimeout(renderReveal, 440);
}

function renderReveal() {
  clearTimedModeTimer();
  const tokoh = currentTokoh();
  const result = state.lastResult;
  const number = state.questionIndex + 1;
  const total = state.questions.length;
  const progress = (number / total) * 100;
  const resultTitle = result.isCorrect ? "Correct!" : "Not Quite";
  const resultClass = result.isCorrect ? "is-right" : "is-wrong";
  let usingPlaceholder = !tokoh.image || tokoh.image === PLACEHOLDER_IMAGE;
  let resultCopy;
  if (result.isCorrect && state.streak >= 3)
    resultCopy = `You earned ${result.awardedPoints} double points!`;
  else if (result.isCorrect) resultCopy = `You earned ${result.awardedPoints} points.`;
  else resultCopy = "That answer earned no points.";
  appStatus.textContent = "";
  app.innerHTML = `<section class="screen"><div class="panel panel-magenta"><div class="topbar"><span class="progress-label">Tokoh ${number}/${total}</span><span class="score-chip">Score: ${state.score}</span></div><div class="progress-track" role="progressbar" aria-label="Game progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${number}" aria-valuetext="Tokoh ${number} of ${total}"><div class="progress-fill" style="width: ${progress}%"></div></div><h1 class="screen-header reveal-state ${resultClass}">${resultTitle}</h1><p class="result-copy">${escapeHTML(resultCopy)}</p><h2 class="correct-name">${escapeHTML(tokoh.name)}</h2><span class="era-tag" style="--era-accent: ${getEraAccent(tokoh.era)};">${escapeHTML(bank.eraBuckets[tokoh.era])}</span><div class="portrait-frame"><img id="tokoh-image" src="${escapeAttribute(tokoh.image || PLACEHOLDER_IMAGE)}" alt="${usingPlaceholder ? "Portrait unavailable for" : "Portrait of"} ${escapeAttribute(tokoh.name)}"></div><p class="summary">${escapeHTML(tokoh.summary)}</p><button id="continue-button" class="button button-primary" type="button">${number === total ? "See score" : "Continue"}</button></div></section>`;
  const image = document.getElementById("tokoh-image");
  image.addEventListener("error", () => {
    image.alt = `Portrait unavailable for ${tokoh.name}`;
    if (!usingPlaceholder) {
      usingPlaceholder = true;
      image.src = PLACEHOLDER_IMAGE;
    }
  });
  document.getElementById("continue-button").addEventListener("click", continueGame);
  focusView();
}

function continueGame() {
  if (state.questionIndex >= state.questions.length - 1) {
    renderScore();
    return;
  }
  state.questionIndex += 1;
  prepareQuestion();
  renderGuess();
}

function renderScore() {
  clearTimedModeTimer();
  sound.play("gameOver");
  const total = state.questions.length;
  const eraPracticeLabel = state.eraPractice
    ? bank.eraBuckets[state.eraPractice]
    : null;
  recordCompletedPlaythrough();
  if (state.newAchievements.length > 0) {
    confetti.burst({ particleCount: 50, spread: 320, originY: 0.35, duration: 1.8 });
  }
  if (lastCompletedPlaythrough && lastCompletedPlaythrough.perfectClassic) {
    confetti.burst({ particleCount: 50, spread: 380, originY: 0.3, duration: 2 });
  }
  appStatus.textContent = state.newAchievements.length
    ? `Achievement${state.newAchievements.length === 1 ? "" : "s"} unlocked: ${state.newAchievements.map((achievement) => achievement.title).join(", ")}.`
    : "";
  app.innerHTML = `<section class="screen"><div class="panel celebration-card"><h1 class="screen-header">Game Over!</h1><div class="progress-track" role="progressbar" aria-label="Game progress" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${total}" aria-valuetext="Game complete"><div class="progress-fill"></div></div><div class="score-number">${state.score}</div><p class="score-label">Total score</p>${state.dailyChallenge ? `<p class="score-label"><small>Today's Daily Challenge</small></p>` : ""}${state.timedMode ? `<p class="score-label"><small>Timed Mode</small></p>` : ""}${eraPracticeLabel ? `<p class="score-label"><small>${escapeHTML(eraPracticeLabel)} Practice</small></p>` : ""}<div class="score-stat">Best streak: <strong>${state.bestStreak}</strong></div>${state.newAchievements.length ? `<div class="new-achievements" aria-label="New achievements">${state.newAchievements.map((achievement) => `<p>🏆 New: ${escapeHTML(achievement.title)}</p>`).join("")}</div>` : ""}<div class="score-actions"><button id="play-again-button" class="button button-primary" type="button">Play again</button><button id="copy-result-button" class="button button-secondary" type="button">Copy result</button></div><button id="change-mode-button" class="button button-link" type="button">Change mode</button></div></section>`;
  document.getElementById("play-again-button").addEventListener("click", () => {
    if (state.dailyChallenge) renderStart();
    else if (state.eraPractice) startGame(false, false, state.eraPractice);
    else if (state.timedMode) startGame(false, false, null, true);
    else startGame(state.studyAll);
  });
  document
    .getElementById("change-mode-button")
    .addEventListener("click", () => renderStart());
  const copyButton = document.getElementById("copy-result-button");
  let copyPending = false;
  let copyFeedbackTimer = null;
  copyButton.addEventListener("click", async () => {
    if (copyPending) return;
    copyPending = true;
    window.clearTimeout(copyFeedbackTimer);
    copyButton.setAttribute("aria-disabled", "true");
    copyButton.textContent = "Copying...";
    appStatus.textContent = "";
    const modeLabel = state.studyAll
      ? `across all ${total} tokoh (Study All)`
      : `over ${total} rounds`;
    const text = state.dailyChallenge
      ? `Tokoh Tekaan Daily — ${state.dailyChallengeDate}: ${state.score} pts, best streak ${state.bestStreak}x. Guess the historical figure: ${location.href}`
      : state.timedMode
        ? `Tokoh Tekaan Timed Mode — ${state.score} pts over ${total} rounds, best streak ${state.bestStreak}x. Guess the historical figure: ${location.href}`
        : eraPracticeLabel
          ? `Tokoh Tekaan — ${state.score} pts practicing ${eraPracticeLabel}, best streak ${state.bestStreak}x. Guess the historical figure: ${location.href}`
          : `Tokoh Tekaan — ${state.score} pts ${modeLabel}, best streak ${state.bestStreak}x. Guess the historical figure: ${location.href}`;
    const copied = await copyText(text);
    copyPending = false;
    if (!copyButton.isConnected) return;
    copyButton.removeAttribute("aria-disabled");
    copyButton.textContent = copied ? "Copied!" : "Copy failed";
    appStatus.textContent = copied
      ? "Result copied to clipboard."
      : "Could not copy result. Please try again.";
    copyFeedbackTimer = window.setTimeout(() => {
      if (copyButton.isConnected) copyButton.textContent = "Copy result";
    }, 1500);
  });
  focusView();
}

async function copyText(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  const textarea = document.createElement("textarea");
  const previousFocus = document.activeElement;
  try {
    textarea.value = text;
    textarea.className = "sr-only";
    textarea.readOnly = true;
    textarea.tabIndex = -1;
    textarea.setAttribute("aria-label", "Result text");
    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousFocus && previousFocus.isConnected) {
      try {
        previousFocus.focus({ preventScroll: true });
      } catch {}
    }
  }
}

function hashDateString(date) {
  let hash = 2166136261;
  for (let index = 0; index < date.length; index += 1) {
    hash ^= date.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getDailyChallengeQuestions(date) {
  const random = mulberry32(hashDateString(date));
  const items = [...bank.tokoh];
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items.slice(0, PLAYTHROUGH_LENGTH);
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [items[index], items[randomIndex]] = [items[randomIndex], items[index]];
  }
  return items;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHTML(value);
}
