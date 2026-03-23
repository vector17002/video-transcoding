import type { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        let token = req.headers.authorization?.split(" ")[1];
        if (!token) {
            token = req.headers.cookie?.split("token=")[1]?.split(";")[0];
        }

        if (!token) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET || 'secret');

        if (!decodedToken) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        next();
    } catch (error) {
        return res.status(401).json({ message: "Unauthorized" });
    }
}