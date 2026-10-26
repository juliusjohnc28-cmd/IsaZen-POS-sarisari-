import { useEffect, useRef, useState } from 'react';
import spriteUrl from '../assets/hamster-sprite.webp';

/**
 * The hamster mascot. Its eyes follow the mouse pointer.
 *
 * The picture is one 3 x 3 sheet of the same hamster looking in 9 directions:
 *   row 0 = looking up,  row 1 = straight,  row 2 = looking down
 *   col 0 = looking left, col 1 = centre,   col 2 = looking right
 */

const CENTRE = 4; // frame index = row * 3 + col

/** Which of the 9 frames to show for a pointer that is (dx, dy) pixels away from the eyes. */
export function frameFor(dx: number, dy: number, deadZone: number): number {
  if (Math.hypot(dx, dy) < deadZone) return CENTRE;
  // 0 degrees = right, 90 = down (screen coordinates), cut into 8 slices of 45 degrees
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const slice = Math.round(angle / 45); // -4 .. 4
  switch (slice) {
    case 0: return 5; // right
    case 1: return 8; // down-right
    case 2: return 7; // down
    case 3: return 6; // down-left
    case -1: return 2; // up-right
    case -2: return 1; // up
    case -3: return 0; // up-left
    default: return 3; // left (slice 4 or -4)
  }
}

const GLANCES = [0, 1, 2, 3, 5, 6, 7, 8]; // every direction except straight ahead

interface MascotProps {
  className?: string;
}

export function Mascot({ className = '' }: MascotProps) {
  const box = useRef<HTMLDivElement>(null);
  const [frame, setFrame] = useState(CENTRE);
  const [popping, setPopping] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let current = CENTRE;
    let raf = 0;
    let last: { x: number; y: number } | null = null;
    let idleTimer = 0;
    let glanceTimer = 0;

    const show = (next: number) => {
      if (next !== current) {
        current = next;
        setFrame(next);
      }
    };

    // Which frame for the most recent pointer position?
    const update = () => {
      raf = 0;
      const el = box.current;
      if (!el || !last) return;
      const r = el.getBoundingClientRect();
      // the eyes sit a little above the middle of the picture
      const dx = last.x - (r.left + r.width / 2);
      const dy = last.y - (r.top + r.height * 0.42);
      show(frameFor(dx, dy, Math.max(36, r.width * 0.5)));
    };

    // When nobody is moving the pointer (or on a phone), glance around now and then so it feels alive
    const scheduleGlance = () => {
      window.clearTimeout(glanceTimer);
      glanceTimer = window.setTimeout(() => {
        show(GLANCES[Math.floor(Math.random() * GLANCES.length)]);
        glanceTimer = window.setTimeout(() => {
          show(CENTRE);
          scheduleGlance();
        }, 1100);
      }, 2200 + Math.random() * 2400);
    };
    const wakeIdle = () => {
      window.clearTimeout(idleTimer);
      window.clearTimeout(glanceTimer);
      if (reduceMotion) return;
      idleTimer = window.setTimeout(scheduleGlance, 6000);
    };

    const onMove = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      wakeIdle();
      if (!raf) raf = requestAnimationFrame(update); // at most once per screen refresh
    };
    const onLeave = () => {
      last = null;
      show(CENTRE);
      wakeIdle();
    };
    const onHidden = () => {
      if (document.hidden) {
        window.clearTimeout(idleTimer);
        window.clearTimeout(glanceTimer);
      } else wakeIdle();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onHidden);
    wakeIdle();

    return () => {
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      document.removeEventListener('visibilitychange', onHidden);
      window.clearTimeout(idleTimer);
      window.clearTimeout(glanceTimer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const pop = () => {
    setPopping(true);
    window.setTimeout(() => setPopping(false), 520);
  };

  const row = Math.floor(frame / 3);
  const col = frame % 3;

  return (
    <div
      ref={box}
      className={`mascot ${popping ? 'is-popping' : ''} ${className}`}
      onClick={pop}
      aria-hidden="true"
      data-frame={frame}
    >
      {/* The breathing animation lives on this wrapper; the sprite inside only swaps frames */}
      <div className="mascot-body">
        <span
          className="mascot-sprite"
          style={{ backgroundImage: `url(${spriteUrl})`, backgroundPosition: `${col * 50}% ${row * 50}%` }}
        />
      </div>
    </div>
  );
}
