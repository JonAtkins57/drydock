import { z } from 'zod';

export const registerSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const authTokensResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
});

export type AuthTokensResponse = z.infer<typeof authTokensResponseSchema>;

export const userResponseSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  isActive: z.boolean(),
  lastLogin: z.string().nullable(),
  createdAt: z.string(),
});

export type UserResponse = z.infer<typeof userResponseSchema>;
