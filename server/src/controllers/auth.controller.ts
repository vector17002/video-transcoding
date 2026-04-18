import { createUser, findUserByEmail } from "../services/user.service.js";
import type { Request, Response } from "express";
import { comparePassword, hashPassword } from "../services/auth.service.js";
import { createToken } from "../utils/jwt.js";

export const registerUser = async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const email = body["email"];
    const password = body["password"];

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    const existingUser = await findUserByEmail(email);

    if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = hashPassword(password);
    const user = await createUser({ email, password: hashedPassword });

    if (!user) {
        return res.status(400).json({ message: "User not created" });
    }

    const token = createToken(user);
    return res.status(201).json({ message: "User created successfully", user, token });
};

export const loginUser = async (req: Request, res: Response) => {
    const body = req.body as Record<string, unknown>;
    const email = body["email"];
    const password = body["password"];

    if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
        return res.status(400).json({ message: "User not found" });
    }

    const isPasswordValid = comparePassword(password, user.password);
    if (!isPasswordValid) {
        return res.status(400).json({ message: "Invalid password" });
    }

    const token = createToken(user);
    return res.status(200).json({ message: "User logged in successfully", user, token });
};