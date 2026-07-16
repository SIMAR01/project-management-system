import dotenv from "dotenv";
dotenv.config();
import http from "http";
import { Server } from "socket.io";
import app from "./app";
import { connectDB } from "./config/database";
import { connectRedis } from "./config/redis";
import { socketAuthMiddleware } from "./sockets/auth.socket";
import { setIoInstance, registerProjectSocketHandlers } from "./sockets/project.socket";

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Establish MongoDB Connection
    await connectDB();

    // 2. Establish Redis Connection
    await connectRedis();

    // 3. Create HTTP Server wrapping Express App
    const server = http.createServer(app);

    // 4. Initialize Socket.IO Server
    const io = new Server(server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
      },
    });

    // Save running server instance to the project socket registry
    setIoInstance(io);

    // 5. Register Socket.IO Handshake Authentication Middleware
    io.use(socketAuthMiddleware);

    // 6. Connect Socket Event Listeners
    io.on("connection", (socket) => {
      const user = (socket as any).user;
      console.log(`Socket client connected: ${user.username} (ID: ${user.id})`);

      // Register project workspace room membership listeners
      registerProjectSocketHandlers(io, socket);

      socket.on("disconnect", () => {
        console.log(`Socket client disconnected: ${user.username} (ID: ${user.id})`);
      });
    });

    // 7. Start Listening
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Startup Error:", error);
    process.exit(1);
  }
};

startServer();