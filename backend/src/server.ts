import dotenv from "dotenv";
dotenv.config();
import http from "http";
import app from "./app";
import { connectDB } from "./config/database";
import { connectRedis } from "./config/redis";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    await connectRedis();

    const server = http.createServer(app);

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Startup Error:", error);

    process.exit(1);
  }
};

startServer();