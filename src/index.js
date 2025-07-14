import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import leadRoutes from "./routes/leadRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import captchaRoutes from "./routes/captchaRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import googleSheetRoutes from "./routes/googleSheet.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Configuration for both development and production
const allowedOrigins = [
  'http://localhost:5173', // Development frontend
  'http://localhost:3000',
  'https://leadgen-frontend-one.vercel.app',
  'https://leadgen-frontend-git-main-saudkhanbpks-projects.vercel.app'
  // Add your custom domain here if you have one
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`❌ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use("/api/leads", leadRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/auth", authRoutes); // <-- updated usage
app.use("/api/captcha", captchaRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/sheets', googleSheetRoutes);

app.get("/", (req, res) => {
  res.send("Lead Generation API is running 🚀");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
