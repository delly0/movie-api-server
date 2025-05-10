const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" });
    }

    const token = authHeader.replace(/^Bearer /, "");

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (e) {
        if (e.name === "TokenExpiredError") {
            return res.status(401).json({ error: true, message: "JWT token has expired" });
        } else {
            return res.status(401).json({ error: true, message: "Invalid JWT token" });
        }
    }
};
