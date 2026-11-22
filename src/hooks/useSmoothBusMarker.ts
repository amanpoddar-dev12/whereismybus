import { useEffect, useRef, useState } from 'react';

export interface SmoothBusPosition {
  lat: number;
  lon: number;
  bearing: number;
}

/**
 * Projects a GPS coordinate onto the nearest segment of a route polyline
 * to eliminate lateral GPS jitter when the point is within ~150m of the road.
 */
export function snapPointToPolyline(
  point: [number, number],
  polyline?: [number, number][] | null
): [number, number] {
  if (!polyline || polyline.length < 2) return point;

  const [px, py] = point;
  const cosLat = Math.cos((px * Math.PI) / 180) || 1;
  let bestDistSq = Infinity;
  let bestPoint: [number, number] = point;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [ax, ay] = polyline[i];
    const [bx, by] = polyline[i + 1];

    const dx = bx - ax;
    const dy = (by - ay) * cosLat;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = ((px - ax) * dx + (py - ay) * cosLat * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const projLat = ax + t * (bx - ax);
    const projLon = ay + t * (by - ay);
    const dLat = px - projLat;
    const dLon = (py - projLon) * cosLat;
    const distSq = dLat * dLat + dLon * dLon;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestPoint = [projLat, projLon];
    }
  }

  // ~0.0014 deg ≈ 150m snap threshold
  return bestDistSq <= 0.0014 * 0.0014 ? bestPoint : point;
}

function interpolateBearing(fromDeg: number, toDeg: number, t: number): number {
  const delta = ((toDeg - fromDeg + 540) % 360) - 180;
  return (((fromDeg + delta * t) % 360) + 360) % 360;
}

/**
 * Smoothly animates a live bus marker between incoming GPS updates using
 * requestAnimationFrame (cubic ease-out) with shortest-arc bearing rotation
 * and optional snap-to-polyline road alignment.
 */
export function useSmoothBusMarker(
  targetLat: number | null,
  targetLon: number | null,
  targetBearing: number,
  polyline?: [number, number][] | null,
  durationMs = 900
): SmoothBusPosition | null {
  const [current, setCurrent] = useState<SmoothBusPosition | null>(() =>
    targetLat !== null && targetLon !== null
      ? { lat: targetLat, lon: targetLon, bearing: targetBearing }
      : null
  );

  const currentRef = useRef<SmoothBusPosition | null>(current);
  currentRef.current = current;

  useEffect(() => {
    if (targetLat === null || targetLon === null) {
      setCurrent(null);
      return;
    }

    const [snappedLat, snappedLon] = snapPointToPolyline(
      [targetLat, targetLon],
      polyline
    );

    const start = currentRef.current ?? {
      lat: snappedLat,
      lon: snappedLon,
      bearing: targetBearing,
    };

    const dist = Math.hypot(snappedLat - start.lat, snappedLon - start.lon);
    if (dist < 1e-7 && Math.abs(targetBearing - start.bearing) < 0.5) {
      setCurrent({
        lat: snappedLat,
        lon: snappedLon,
        bearing: targetBearing,
      });
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const rawT = Math.min(1, elapsed / Math.max(100, durationMs));
      const eased = 1 - Math.pow(1 - rawT, 3);

      setCurrent({
        lat: start.lat + (snappedLat - start.lat) * eased,
        lon: start.lon + (snappedLon - start.lon) * eased,
        bearing: interpolateBearing(start.bearing, targetBearing, eased),
      });

      if (rawT < 1) {
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [durationMs, polyline, targetBearing, targetLat, targetLon]);

  return current;
}
