import { verifyToken } from "../services/fcmService.js";

export const authMiddlewre = async (req, res, next) => {
    const idToken = req.headers.authorization?.split("Bearer ")[1];
    if (!idToken) {
        return res.status(401).send("No token provided");
    }
    try {
        const decodedToken = await verifyToken(idToken);
        req.user = decodedToken;
        // console.log(req.user);
        next();
    } catch (error) {
        console.error("Auth Middleware Error:", error);
        res.status(401).send("Invalid token");
    }
};
