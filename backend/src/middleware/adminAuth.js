const jwt = require("jsonwebtoken");

function adminAuth(req, res, next) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    // Hard fail — JWT_SECRET must be set. No insecure fallback.
    return res.status(500).json({ error: "Server misconfiguration: JWT_SECRET not set" });
  }
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Admin auth required" });
  }
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, jwtSecret);
    if (!payload.admin) return res.status(403).json({ error: "Not an admin" });
    req.adminUser = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired admin token" });
  }
}

module.exports = { adminAuth };
