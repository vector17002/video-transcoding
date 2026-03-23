import { Router } from "express";
import { loginUser, registerUser } from "../controllers/auth.controller.js";

const router = Router()

router.post("/register", registerUser)

router.post("/login", loginUser)

router.post("/logout", (req, res) => {
    res.clearCookie("token")
    res.status(200).json({ message: "User logged out successfully" })
})

export default router