import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import leadRoutes from "./routes/leadRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import captchaRoutes from "./routes/captchaRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    process.env.Vite_CLIENT_URL
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

app.use("/api/leads", leadRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/captcha", captchaRoutes);

app.get("/", (req, res) => {
  res.send("Lead Generation API is running 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
