import * as jwt from "jsonwebtoken";
import * as crypto from "crypto";

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export interface JwtPayload {
  userId: number;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

export class TokenService {
  /**
   * Generate JWT token
   */
  static generateToken(userId: number, username: string, role: string): string {
    return jwt.sign(
      {
        userId,
        username,
        role,
      },
      JWT_SECRET as any,
      {
        expiresIn: JWT_EXPIRES_IN,
        algorithm: "HS256",
      } as any,
    );
  }

  /**
   * Verify JWT token
   */
  static verifyToken(token: string): JwtPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET as any, {
        algorithms: ["HS256"],
      });
      return decoded as JwtPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate API key (random 32 bytes, base64 encoded)
   */
  static generateApiKey(prefix: string = "sk"): string {
    const randomBytes = crypto.randomBytes(32);
    const encoded = randomBytes.toString("base64").replace(/[+/=]/g, "");
    return `${prefix}_${encoded}`;
  }

  /**
   * Hash API key (SHA256)
   */
  static hashApiKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  /**
   * Verify API key against hash
   */
  static verifyApiKey(key: string, hash: string): boolean {
    const computed = this.hashApiKey(key);
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }

  /**
   * Hash password (bcrypt simulation - use actual bcrypt in production)
   */
  static hashPassword(password: string): string {
    // In production, use: import bcrypt from 'bcrypt'; return bcrypt.hashSync(password, 10);
    return crypto.createHash("sha256").update(password).digest("hex");
  }

  /**
   * Verify password
   */
  static verifyPassword(password: string, hash: string): boolean {
    const computed = this.hashPassword(password);
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
  }

  /**
   * Extract token from Authorization header
   */
  static extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null;

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      return null;
    }

    return parts[1];
  }
}
