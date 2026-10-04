/**
 * PALETTE-MASTER VIBECODER (32 colores) — espejo de
 * vibecoder-latam/design/PALETTE-MASTER.json (candado ART-DIRECTIVE §6).
 * Biblioteca institucional de solo lectura del panel PALETTE (UX §4);
 * la paleta editable del documento arranca como copia de esta.
 */
export interface MasterColor {
  hex: string;
  name: string;
  family: string;
}

export const PALETTE_MASTER: MasterColor[] = [
  { hex: '#1b1e2b', name: 'ink', family: 'ui' },
  { hex: '#3a3f52', name: 'shadow_cool', family: 'ui' },
  { hex: '#c0bfbc', name: 'grey', family: 'ui' },
  { hex: '#e6e8f0', name: 'white', family: 'ui' },
  { hex: '#7a5230', name: 'skin_deep', family: 'skin' },
  { hex: '#986a44', name: 'skin_shadow', family: 'skin' },
  { hex: '#c98d54', name: 'skin_mid', family: 'skin' },
  { hex: '#e0ac69', name: 'skin_light', family: 'skin' },
  { hex: '#5b3fd6', name: 'violet_shadow', family: 'cloth' },
  { hex: '#7c5cff', name: 'violet', family: 'cloth' },
  { hex: '#2a5db0', name: 'blue_shadow', family: 'cloth' },
  { hex: '#3584e4', name: 'blue', family: 'cloth' },
  { hex: '#a01820', name: 'red_shadow', family: 'cloth' },
  { hex: '#e01b24', name: 'red', family: 'cloth' },
  { hex: '#2f7d4f', name: 'green_dark', family: 'cloth' },
  { hex: '#1f9e57', name: 'green', family: 'cloth' },
  { hex: '#33d17a', name: 'green_light', family: 'cloth' },
  { hex: '#6d4b5a', name: 'mauve_fabric', family: 'cloth' },
  { hex: '#6e4a2f', name: 'wood_deep', family: 'wood' },
  { hex: '#7a5a34', name: 'wood_shadow', family: 'wood' },
  { hex: '#8a6d3b', name: 'wood_mid', family: 'wood' },
  { hex: '#b58b4e', name: 'wood_light', family: 'wood' },
  { hex: '#1c2a3a', name: 'metal_darkest', family: 'metal' },
  { hex: '#26303f', name: 'metal_dark', family: 'metal' },
  { hex: '#3a3a44', name: 'metal_neutral', family: 'metal' },
  { hex: '#4a5060', name: 'metal_mid', family: 'metal' },
  { hex: '#8fa0b3', name: 'metal_light', family: 'metal' },
  { hex: '#245a55', name: 'screen_edge', family: 'screen' },
  { hex: '#6fd0c0', name: 'screen_glow', family: 'screen' },
  { hex: '#b8f5e8', name: 'screen_bright', family: 'screen' },
  { hex: '#c9b458', name: 'gold', family: 'accent' },
  { hex: '#c95c4b', name: 'alert', family: 'accent' },
];

export const MASTER_HEX_SET = new Set(PALETTE_MASTER.map((c) => c.hex.toLowerCase()));
