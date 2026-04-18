import jwt from "jsonwebtoken";
import type { User } from "../models/user.model.js";


export const createToken = (user: User) => {
    return jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET || "secret",
        { expiresIn: "1h" }
    );
};

export const verifyToken = (token: string) => {
    return jwt.verify(token, process.env.JWT_SECRET || "secret");
};