const abTestService  = require("../services/abTestService");
const { E, apiError } = require("../utils/errors");

// ============================================================
// AB TEST CONTROLLER — Admin-only, JWT protected
//
// GET  /api/admin/ab/experiments              — list all
// POST /api/admin/ab/experiments              — create new
// GET  /api/admin/ab/experiments/:id          — get one with results
// PATCH /api/admin/ab/experiments/:id         — update fields
// GET  /api/admin/ab/experiments/:id/results  — detailed results
// POST /api/admin/ab/experiments/:id/status   — set status
// ============================================================

const VALID_STATUSES = ["draft", "active", "paused", "archived"];

const GOAL_METRICS = [
  { id: "game_won",          label: "Win Rate" },
  { id: "result_shared",     label: "Share Rate" },
  { id: "game_started",      label: "Session Start" },
  { id: "leaderboard_viewed",label: "Leaderboard Views" },
];

async function listExperiments(req, res, next) {
  try {
    const experiments = await abTestService.getAllExperiments();
    res.json({ experiments, goalMetrics: GOAL_METRICS });
  } catch (err) { next(err); }
}

async function createExperiment(req, res, next) {
  try {
    const { slug, name, description, trafficPct, variants, goalMetric } = req.body;

    if (!slug || !name) {
      return res.status(400).json({ error: "slug and name are required" });
    }
    if (!/^[a-z0-9_-]+$/.test(slug)) {
      return res.status(400).json({ error: "slug must be lowercase letters, numbers, underscores, hyphens only" });
    }
    if (!variants || variants.length < 2) {
      return res.status(400).json({ error: "At least 2 variants are required" });
    }
    for (const v of variants) {
      if (!v.id || !v.name) return res.status(400).json({ error: "Each variant needs id and name" });
      if (typeof v.weight !== "number" || v.weight < 1) {
        return res.status(400).json({ error: `Variant "${v.id}" weight must be a positive number` });
      }
    }

    const exp = await abTestService.createExperiment({ slug, name, description, trafficPct, variants, goalMetric });
    res.status(201).json({ ok: true, experiment: exp });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json(apiError(E.EXPERIMENT_SLUG_TAKEN, `Slug "${req.body.slug}" already exists`));
    }
    next(err);
  }
}

async function getExperiment(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await require("../db/postgres").query(
      `SELECT e.*,
         (SELECT COUNT(*) FROM ab_assignments a WHERE a.experiment_id = e.id) AS total_assignments,
         (SELECT COUNT(*) FROM ab_events     v WHERE v.experiment_id = e.id) AS total_conversions
       FROM ab_experiments e WHERE e.id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json(apiError(E.EXPERIMENT_NOT_FOUND, "Experiment not found"));

    const { results, trend } = await abTestService.getResults(id);
    res.json({ experiment: rows[0], results, trend, goalMetrics: GOAL_METRICS });
  } catch (err) { next(err); }
}

async function updateExperiment(req, res, next) {
  try {
    const { id } = req.params;
    const allowed = ["name", "description", "trafficPct", "variants", "goalMetric"];
    const updates = {};
    for (const k of allowed) {
      if (req.body[k] !== undefined) updates[k] = req.body[k];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }
    const exp = await abTestService.updateExperiment(id, updates);
    if (!exp) return res.status(404).json(apiError(E.EXPERIMENT_NOT_FOUND, "Experiment not found"));
    res.json({ ok: true, experiment: exp });
  } catch (err) { next(err); }
}

async function getResults(req, res, next) {
  try {
    const { id } = req.params;
    const { results, trend } = await abTestService.getResults(id);
    res.json({ results, trend });
  } catch (err) { next(err); }
}

async function setStatus(req, res, next) {
  try {
    const { id }     = req.params;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    }

    const exp = await abTestService.updateExperiment(id, { status });
    if (!exp) return res.status(404).json(apiError(E.EXPERIMENT_NOT_FOUND, "Experiment not found"));

    abTestService.invalidateCache();
    res.json({ ok: true, experiment: exp, message: `Experiment ${status}` });
  } catch (err) { next(err); }
}

module.exports = { listExperiments, createExperiment, getExperiment, updateExperiment, getResults, setStatus };
