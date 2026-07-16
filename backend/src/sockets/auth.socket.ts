import { Socket } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";

/**
 * Socket.IO handshake authentication middleware.
 * Validates the Access Token statelessly with 0 database hits.
 */
export const socketAuthMiddleware = (
  socket: Socket,
  next: (err?: Error) => void
): void => {
  try {
    // 1. Retrieve token from auth payload or fallback to Authorization header
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(" ")[1];

    if (!token) {
      return next(new Error("Authentication error: Access Token missing"));
    }

    // 2. Statelessly verify the JWT token
    const decoded = verifyAccessToken(token);

    // 3. Attach user identity to socket object
    (socket as any).user = decoded;

    next();
  } catch (error: any) {
    next(new Error(`Authentication error: ${error.message || "Invalid Access Token"}`));
  }
};
