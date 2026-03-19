const db     = require("../db/postgres");
const logger = require("../utils/logger");

// ============================================================
// A/B TEST SERVICE
//
// Assignment is deterministic: hash(experimentId + identityKey)
// → same user always gets same variant, no DB read needed for
//   the hash itself, but we persist to enable result queries.
//
// Variant weights are respected via weighted bucket selection.
// traffic_pct controls what share of users enter the experiment
// at all — the rest get null (control/no experiment).
// ============================================================

// ── In-memory experiment cache ────────────────────────────────
let _experiments    = null;   // Map<slug, experiment>
let _lastCacheTime  = 0;
const CACHE_TTL_MS  = 30_000; // re-read DB every 30s

async function getExperiments(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _experiments && (now - _lastCacheTime) < CACHE_TTL_MS) {
    return _experiments;
  }
  const { rows } = await db.query(
    "SELECT * FROM ab_experiments WHERE status = 'active' ORDER BY created_at"
  );
  _experiments   = new Map(rows.map(r => [r.slug, r]));
  _lastCacheTime = now;
  return _experiments;
}

/** Invalidate the in-memory cache (called after status changes) */
function invalidateCache() {
  _experiments   = null;
  _lastCacheTime = 0;
}

// ── Deterministic hash ────────────────────────────────────────
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash;
}

/**
 * Pick a variant given a list of variants with weights.
 * Weights don't need to sum to 100 — they're relative.
 */
function pickVariant(variants, hashValue) {
  const total = variants.reduce((s, v) => s + (v.weight || 1), 0);
  let bucket  = hashValue % total;
  for (const v of variants) {
    bucket -= (v.weight || 1);
    if (bucket < 0) return v.id;
  }
  return variants[variants.length - 1].id;
}

// ── Core: assign a variant ────────────────────────────────────
/**
 * Get or create a stable variant assignment for an identity.
 *
 * @param {string} slug         - experiment slug
 * @param {string} identityKey  - player UUID or anonymous session UUID
 * @param {string} identityType - 'player' | 'anonymous'
 * @returns {string|null} variantId, or null if user is outside traffic bucket
 */
async function assign(slug, identityKey, identityType = "player") {
  try {
    const experiments = await getExperiments();
    const exp = experiments.get(slug);
    if (!exp) return null;

    const variants = exp.variants;
    if (!variants || variants.length === 0) return null;

    // Traffic bucketing — hash(slug + identity) → 0..99
    const trafficHash = djb2(`traffic:${slug}:${identityKey}`) % 100;
    if (trafficHash >= exp.traffic_pct) return null; // outside traffic

    // Variant assignment — separate hash so traffic and variant are independent
    const variantHash = djb2(`variant:${exp.id}:${identityKey}`);
    const variantId   = pickVariant(variants, variantHash);

    // Persist assignment (upsert — idempotent)
    await db.query(
      `INSERT INTO ab_assignments (experiment_id, identity_key, identity_type, variant_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (experiment_id, identity_key) DO NOTHING`,
      [exp.id, identityKey, identityType, variantId]
    );

    return variantId;
  } catch (err) {
    logger.debug("AB assign error (non-critical)", { slug, error: err.message });
    return null; // never break gameplay
  }
}

/**
 * Get all active experiment assignments for a given identity.
 * Returns Map<slug, variantId>
 */
async function assignAll(identityKey, identityType = "player") {
  const assignments = new Map();
  try {
    const experiments = await getExperiments();
    for (const [slug] of experiments) {
      const variantId = await assign(slug, identityKey, identityType);
      if (variantId) assignments.set(slug, variantId);
    }
  } catch (err) {
    logger.debug("AB assignAll error (non-critical)", { error: err.message });
  }
  return assignments;
}

// ── Track goal event ──────────────────────────────────────────
/**
 * Record that an identity hit the goal metric for an experiment.
 * Fire-and-forget — never throws.
 *
 * @param {string} identityKey
 * @param {string} eventName   - e.g. 'game_won', 'result_shared'
 * @param {object} properties  - e.g. { score, attempts, wordLength }
 */
async function trackGoal(identityKey, eventName, properties = {}) {
  try {
    // Find all assignments for this identity where the goal event matches
    const { rows } = await db.query(
      `SELECT a.id, a.experiment_id, a.variant_id
       FROM ab_assignments a
       JOIN ab_experiments e ON e.id = a.experiment_id
       WHERE a.identity_key = $1
         AND e.status = 'active'
         AND e.goal_metric = $2`,
      [identityKey, eventName]
    );

    for (const row of rows) {
      await db.query(
        `INSERT INTO ab_events (assignment_id, experiment_id, variant_id, event_name, properties)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, row.experiment_id, row.variant_id, eventName, JSON.stringify(properties)]
      );
    }
  } catch (err) {
    logger.debug("AB trackGoal error (non-critical)", { error: err.message });
  }
}

// ── Results aggregation ───────────────────────────────────────
/**
 * Get per-variant results for an experiment.
 * Returns statistical summary: assignments, conversions, rate, avg score.
 */
async function getResults(experimentId) {
  // Assignments per variant
  const { rows: assignRows } = await db.query(
    `SELECT variant_id, COUNT(*) AS assignments
     FROM ab_assignments
     WHERE experiment_id = $1
     GROUP BY variant_id`,
    [experimentId]
  );

  // Conversions + avg score per variant
  const { rows: convRows } = await db.query(
    `SELECT variant_id,
            COUNT(DISTINCT assignment_id) AS conversions,
            AVG((properties->>'score')::numeric) FILTER (WHERE properties->>'score' IS NOT NULL) AS avg_score,
            AVG((properties->>'attempts')::numeric) FILTER (WHERE properties->>'attempts' IS NOT NULL) AS avg_attempts
     FROM ab_events
     WHERE experiment_id = $1
     GROUP BY variant_id`,
    [experimentId]
  );

  // Daily assignment trend (last 14 days)
  const { rows: trendRows } = await db.query(
    `SELECT DATE(assigned_at) AS date, variant_id, COUNT(*) AS count
     FROM ab_assignments
     WHERE experiment_id = $1
       AND assigned_at >= NOW() - INTERVAL '14 days'
     GROUP BY DATE(assigned_at), variant_id
     ORDER BY date`,
    [experimentId]
  );

  // Merge into per-variant objects
  const convMap = new Map(convRows.map(r => [r.variant_id, r]));
  const results = assignRows.map(r => {
    const conv  = convMap.get(r.variant_id) || {};
    const total = parseInt(r.assignments);
    const converted = parseInt(conv.conversions || 0);
    return {
      variantId:   r.variant_id,
      assignments: total,
      conversions: converted,
      conversionRate: total > 0 ? ((converted / total) * 100).toFixed(1) : "0.0",
      avgScore:    conv.avg_score ? parseFloat(parseFloat(conv.avg_score).toFixed(1)) : null,
      avgAttempts: conv.avg_attempts ? parseFloat(parseFloat(conv.avg_attempts).toFixed(2)) : null,
    };
  });

  return { results, trend: trendRows };
}

// ── Admin CRUD ────────────────────────────────────────────────
async function getAllExperiments() {
  const { rows } = await db.query(
    `SELECT e.*,
       (SELECT COUNT(*) FROM ab_assignments a WHERE a.experiment_id = e.id) AS total_assignments,
       (SELECT COUNT(*) FROM ab_events     v WHERE v.experiment_id = e.id) AS total_conversions
     FROM ab_experiments e
     ORDER BY
       CASE e.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
       e.created_at DESC`
  );
  return rows;
}

async function createExperiment({ slug, name, description, trafficPct, variants, goalMetric }) {
  const { rows } = await db.query(
    `INSERT INTO ab_experiments (slug, name, description, traffic_pct, variants, goal_metric)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [slug, name, description || null, trafficPct || 100, JSON.stringify(variants), goalMetric || "game_won"]
  );
  return rows[0];
}

async function updateExperiment(id, updates) {
  const fields = [];
  const values = [];
  let i = 1;

  if (updates.name        !== undefined) { fields.push(`name = $${i++}`);         values.push(updates.name); }
  if (updates.description !== undefined) { fields.push(`description = $${i++}`);  values.push(updates.description); }
  if (updates.trafficPct  !== undefined) { fields.push(`traffic_pct = $${i++}`);  values.push(updates.trafficPct); }
  if (updates.variants    !== undefined) { fields.push(`variants = $${i++}`);     values.push(JSON.stringify(updates.variants)); }
  if (updates.goalMetric  !== undefined) { fields.push(`goal_metric = $${i++}`);  values.push(updates.goalMetric); }

  if (updates.status !== undefined) {
    fields.push(`status = $${i++}`);
    values.push(updates.status);
    if (updates.status === "active")   { fields.push(`started_at = COALESCE(started_at, NOW())`); }
    if (updates.status === "archived") { fields.push(`ended_at = NOW()`);   }
  }

  if (fields.length === 0) throw new Error("No fields to update");
  values.push(id);

  const { rows } = await db.query(
    `UPDATE ab_experiments SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    values
  );
  invalidateCache();
  return rows[0];
}

module.exports = {
  assign,
  assignAll,
  trackGoal,
  getResults,
  getAllExperiments,
  createExperiment,
  updateExperiment,
  invalidateCache,
};
