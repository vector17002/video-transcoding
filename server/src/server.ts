import app from "./app.js";
import { authMiddleware } from "./middleware/auth.middleware.js";

const PORT = process.env.PORT || 3000

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" })
})

app.get("/protected", authMiddleware, (req, res) => {
    res.status(200).json({ message: "Protected" })
})

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
})