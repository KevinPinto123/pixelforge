import { z } from 'zod';

export const IdSchema = z.string().min(1).max(64);
export type Id = z.infer<typeof IdSchema>;

export const TimestampsSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Timestamps = z.infer<typeof TimestampsSchema>;

export const EngineTargetSchema = z.enum(['godot', 'unity', 'phaser', 'custom']);
export type EngineTarget = z.infer<typeof EngineTargetSchema>;

export const DirectionSchema = z.enum(['south', 'north', 'east', 'west', 'se', 'sw', 'ne', 'nw']);
export type Direction = z.infer<typeof DirectionSchema>;

export const AnimationActionSchema = z.enum([
  'idle',
  'walk',
  'run',
  'attack',
  'jump',
  'cast',
  'death',
]);
export type AnimationAction = z.infer<typeof AnimationActionSchema>;

export const CanvasSizeSchema = z.object({
  w: z.number().int().min(1).max(1024),
  h: z.number().int().min(1).max(1024),
});
export type CanvasSize = z.infer<typeof CanvasSizeSchema>;
