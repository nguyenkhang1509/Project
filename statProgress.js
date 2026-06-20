export const STAT_KEYS = [
  "Physical",
  "Intellectual",
  "Mental",
  "Confidence",
  "Discipline",
];

export const CATEGORY_TO_STAT_KEY = Object.freeze({
  physical: "Physical",
  intellectual: "Intellectual",
  mental: "Mental",
  confidence: "Confidence",
  discipline: "Discipline",
});

export function createEmptyStats() {
  return {
    Physical: 0,
    Intellectual: 0,
    Mental: 0,
    Confidence: 0,
    Discipline: 0,
  };
}

export function createEmptyStatPoints() {
  return {
    Physical: 0,
    Intellectual: 0,
    Mental: 0,
    Confidence: 0,
    Discipline: 0,
  };
}

export function createEmptyStatUpgrades() {
  return [];
}

export function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function normalizeStats(value) {
  const next = createEmptyStats();
  if (!value || typeof value !== "object") return next;

  STAT_KEYS.forEach((key) => {
    const num = Number(value[key]);
    next[key] = Number.isFinite(num) ? clamp(Math.round(num), 0, 100) : 0;
  });

  return next;
}

export function normalizeStatPoints(value) {
  const next = createEmptyStatPoints();
  if (!value || typeof value !== "object") return next;

  STAT_KEYS.forEach((key) => {
    const num = Math.floor(Number(value[key]));
    next[key] = Number.isFinite(num) ? Math.max(0, num) : 0;
  });

  return next;
}

export function normalizeStatUpgrades(value) {
  if (!Array.isArray(value)) return createEmptyStatUpgrades();

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;

      const sourceKey = STAT_KEYS.includes(entry.sourceKey)
        ? entry.sourceKey
        : null;
      const targetKey = STAT_KEYS.includes(entry.targetKey)
        ? entry.targetKey
        : null;
      const levels = Math.max(0, Math.floor(Number(entry.levels) || 0));
      const costPerLevel = Number(entry.costPerLevel) === 1 ? 1 : 2;

      if (!sourceKey || !targetKey || levels <= 0) return null;

      return {
        id:
          typeof entry.id === "string" && entry.id.trim()
            ? entry.id.trim()
            : `sup_${Math.random().toString(36).slice(2, 10)}`,
        sourceKey,
        targetKey,
        levels,
        costPerLevel,
        createdAt:
          typeof entry.createdAt === "string" && entry.createdAt.trim()
            ? entry.createdAt.trim()
            : new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export function sumStatPoints(value) {
  const points = normalizeStatPoints(value);
  return STAT_KEYS.reduce((total, key) => total + points[key], 0);
}

export function getStatKeyFromCategory(category) {
  const safeCategory = String(category || "")
    .trim()
    .toLowerCase();
  return CATEGORY_TO_STAT_KEY[safeCategory] || "Physical";
}

export function getUpgradeCost(sourceKey, targetKey) {
  return sourceKey === targetKey ? 1 : 2;
}

export function getMaxUpgradeLevels(stats, statPoints, sourceKey, targetKey) {
  const safeStats = normalizeStats(stats);
  const safePoints = normalizeStatPoints(statPoints);
  const safeSource = STAT_KEYS.includes(sourceKey) ? sourceKey : "Physical";
  const safeTarget = STAT_KEYS.includes(targetKey) ? targetKey : "Physical";
  const cost = getUpgradeCost(safeSource, safeTarget);
  const available = Math.floor((safePoints[safeSource] || 0) / cost);
  const room = Math.max(0, 100 - safeStats[safeTarget]);
  return Math.max(0, Math.min(available, room));
}

export function spendStatPoints(stats, statPoints, sourceKey, targetKey, levels) {
  const safeStats = normalizeStats(stats);
  const safePoints = normalizeStatPoints(statPoints);
  const safeSource = STAT_KEYS.includes(sourceKey) ? sourceKey : "Physical";
  const safeTarget = STAT_KEYS.includes(targetKey) ? targetKey : "Physical";
  const desiredLevels = Math.max(0, Math.floor(Number(levels) || 0));

  if (desiredLevels <= 0) return null;

  const maxLevels = getMaxUpgradeLevels(
    safeStats,
    safePoints,
    safeSource,
    safeTarget,
  );

  if (desiredLevels > maxLevels) return null;

  const cost = desiredLevels * getUpgradeCost(safeSource, safeTarget);
  safePoints[safeSource] = Math.max(0, safePoints[safeSource] - cost);
  safeStats[safeTarget] = Math.min(100, safeStats[safeTarget] + desiredLevels);

  return {
    stats: safeStats,
    statPoints: safePoints,
    cost,
    levels: desiredLevels,
    sourceKey: safeSource,
    targetKey: safeTarget,
  };
}

export function applyStatUpgrade(
  stats,
  statPoints,
  statUpgrades,
  sourceKey,
  targetKey,
  levels,
) {
  const spent = spendStatPoints(stats, statPoints, sourceKey, targetKey, levels);
  if (!spent) return null;

  const history = normalizeStatUpgrades(statUpgrades);
  history.push({
    id: `sup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    sourceKey: spent.sourceKey,
    targetKey: spent.targetKey,
    levels: spent.levels,
    costPerLevel: getUpgradeCost(spent.sourceKey, spent.targetKey),
    createdAt: new Date().toISOString(),
  });

  return {
    ...spent,
    statUpgrades: history.slice(-500),
  };
}

export function applyQuestPointDelta(statPoints, category, delta) {
  const next = normalizeStatPoints(statPoints);
  const statKey = getStatKeyFromCategory(category);
  const nextValue = next[statKey] + Math.floor(Number(delta) || 0);

  if (nextValue < 0) return null;

  next[statKey] = nextValue;
  return { statPoints: next, statKey };
}

export function applyQuestPointChange(
  stats,
  statPoints,
  statUpgrades,
  category,
  delta,
) {
  const safeStats = normalizeStats(stats);
  const safePoints = normalizeStatPoints(statPoints);
  const history = normalizeStatUpgrades(statUpgrades);
  const statKey = getStatKeyFromCategory(category);
  const amount = Math.floor(Number(delta) || 0);

  if (amount === 0) {
    return {
      stats: safeStats,
      statPoints: safePoints,
      statUpgrades: history,
      statKey,
      autoReversedLevels: 0,
      autoReversedTargets: {},
      unresolvedShortfall: 0,
    };
  }

  if (amount > 0) {
    safePoints[statKey] += amount;
    return {
      stats: safeStats,
      statPoints: safePoints,
      statUpgrades: history,
      statKey,
      autoReversedLevels: 0,
      autoReversedTargets: {},
      unresolvedShortfall: 0,
    };
  }

  const needed = Math.abs(amount);
  let autoReversedLevels = 0;
  let unresolvedShortfall = 0;
  const autoReversedTargets = {};

  while (safePoints[statKey] < needed) {
    let reversedAny = false;

    for (let i = history.length - 1; i >= 0 && safePoints[statKey] < needed; i--) {
      const entry = history[i];
      if (entry.sourceKey !== statKey) continue;

      const restoreNeed = needed - safePoints[statKey];
      const levelsToReverse = Math.min(
        entry.levels,
        Math.ceil(restoreNeed / entry.costPerLevel),
      );

      if (levelsToReverse <= 0) continue;

      safeStats[entry.targetKey] = Math.max(
        0,
        safeStats[entry.targetKey] - levelsToReverse,
      );
      safePoints[statKey] += levelsToReverse * entry.costPerLevel;
      entry.levels -= levelsToReverse;
      autoReversedLevels += levelsToReverse;
      autoReversedTargets[entry.targetKey] =
        (autoReversedTargets[entry.targetKey] || 0) + levelsToReverse;
      reversedAny = true;

      if (entry.levels <= 0) history.splice(i, 1);
    }

    if (!reversedAny) break;
  }

  if (safePoints[statKey] < needed) {
    unresolvedShortfall = needed - safePoints[statKey];
  }

  safePoints[statKey] = Math.max(0, safePoints[statKey] - needed);

  return {
    stats: safeStats,
    statPoints: safePoints,
    statUpgrades: history,
    statKey,
    autoReversedLevels,
    autoReversedTargets,
    unresolvedShortfall,
  };
}
