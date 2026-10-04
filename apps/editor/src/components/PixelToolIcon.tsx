// Atlas canónico de videocoder-game/assets/ui/tools/tools_editor16.png. Se incrusta
// para que Electron sea autocontenido y Vite no dependa de archivos fuera del app.
const toolAtlasUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALAAAAAQCAYAAAC2q/WwAAACV0lEQVR42u2aPU4DMRCFcw8kShoa6lCkoUOiRiJX4AacAAquwB2ADgnaXIAjIMrcIGiRZjWy7PGbH++uFFsaRZvEu7PP347H412teust005Ozw9kXQ2DaCXrMOHaea/587s3n8fjR7PxbgkSnffsYlO0JUOMPHxW/RCYht922+vRPDp5fab/P2wPqr78WnS/YWOO3Ixn8Di8uT653yL99wJIonPjg5F+r/V793Zb1S8CYA4f+aoBkfcnQ/qWtOI6hkYXKVJIVgM4d34OMRdU67/kw/Dd1+cHZBLANfA1AKfwShBHAJzCVzrWwKvpW9LPk8qMTr0/3cBORABcisJcEC0ECMA1ABGAo/JKDi31o2N0+rXCm0bgGogSvGhf7jd/WM1RWANvBMDPL6+Q3W2+VdPZIAaZJGIJTuQ/rQBGI7AEgwXeXATOgcgfHAnetC/3K50d0/GypF6jY+v11b+hQngApmvVDAFYA28UwJpKAar/4/0lDK8V4hJ8uQiczoD8OtrPZhGYizclwAjESA6shXdpAKfweioByOBHRWDPQhjJgaH75+KRaZ58ywJIE4UlAbhp4EUAnioHzsHrXXxbIdbmwGgKoa1CpGPfBN7cSjhniIiWOjC/eS286CJOGoQIgCPhjYBYU4XwLOKQOnAVYi+8EQAjUxKSvmjhRWcPFGBLGa0FvF6ItXVgTxlNSrUgiL3wRgHsHSQLvEvYyGgFr2V3zLMTZ93IcBcVOMARe9hzvM8w53sTEQ/AVPqgVRzrBoJ1K9k1vv2lmeNo2krIHC/z9Nbb0bQ/BeFih56LL+sAAAAASUVORK5CYII=';

export type PixelToolIconName =
  | 'brush'
  | 'eraser'
  | 'bucket'
  | 'line'
  | 'rect'
  | 'select'
  | 'wand'
  | 'eyedropper'
  | 'mirror-h'
  | 'mirror-v'
  | 'zoom';

const ATLAS_COLUMN: Record<PixelToolIconName, number> = {
  brush: 0,
  eraser: 1,
  bucket: 2,
  line: 3,
  rect: 4,
  select: 5,
  wand: 6,
  eyedropper: 7,
  'mirror-h': 8,
  'mirror-v': 9,
  zoom: 10,
};

/** Icono 16x16 del atlas PixelForge, siempre a escala entera y sin filtrado. */
export function PixelToolIcon({ name }: { name: PixelToolIconName }) {
  return (
    <span
      className="pixel-tool-icon"
      aria-hidden="true"
      style={{
        backgroundImage: `url(${toolAtlasUrl})`,
        backgroundPosition: `${ATLAS_COLUMN[name] * -16}px 0`,
      }}
    />
  );
}
