import React, { useMemo } from 'react';

interface DynamicQrCodeProps {
  seed: string;
  size?: number;
}

/**
 * Renders a deterministic high-contrast SVG QR matrix from a ticket seed.
 */
export const DynamicQrCode: React.FC<DynamicQrCodeProps> = ({ seed, size = 176 }) => {
  const gridSize = 21;

  const matrix = useMemo(() => {
    let hash = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    const grid: boolean[][] = Array.from({ length: gridSize }, () =>
      Array(gridSize).fill(false)
    );

    const drawFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
          const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r][c0 + c] = isOuter || isInner;
        }
      }
    };

    drawFinder(0, 0);
    drawFinder(0, gridSize - 7);
    drawFinder(gridSize - 7, 0);

    let state = Math.abs(hash) || 1234567;
    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const inTopLeft = r < 8 && c < 8;
        const inTopRight = r < 8 && c >= gridSize - 8;
        const inBottomLeft = r >= gridSize - 8 && c < 8;
        const inCenterLogo = r >= 8 && r <= 12 && c >= 8 && c <= 12;
        if (inTopLeft || inTopRight || inBottomLeft || inCenterLogo) continue;

        state = (state * 1664525 + 1013904223) % 4294967296;
        grid[r][c] = state % 100 < 48;
      }
    }

    return grid;
  }, [seed]);

  const cell = size / gridSize;

  return (
    <div
      className="relative inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white p-2.5 shadow-subtle"
      style={{ width: size + 20, height: size + 20 }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="Dynamic QR Express Ticket"
      >
        <rect width={size} height={size} fill="#FFFFFF" />
        {matrix.map((row, rIdx) =>
          row.map((filled, cIdx) =>
            filled ? (
              <rect
                key={`${rIdx}-${cIdx}`}
                x={cIdx * cell}
                y={rIdx * cell}
                width={cell + 0.3}
                height={cell + 0.3}
                rx={cell * 0.16}
                fill="#18181B"
              />
            ) : null
          )
        )}
      </svg>
      <div className="absolute flex h-7 w-7 items-center justify-center rounded-md bg-zinc-900 text-[9px] font-semibold tracking-tight text-white ring-2 ring-white">
        QR
      </div>
    </div>
  );
};
