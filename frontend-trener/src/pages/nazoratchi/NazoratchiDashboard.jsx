import { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const COL_H   = 3.0;
const REAL_CM = 200;
const FLOOR_Y = -1.65;
const CEIL_Y  = 4.3;
const ROOM_W  = 11;
const ROOM_D  = 10;

/* ─── Materials (shared) ──────────────────────────────────── */
const MAT = {
  steelDark: new THREE.MeshStandardMaterial({ color: '#1e2a38', metalness: 0.92, roughness: 0.18 }),
  steelMid:  new THREE.MeshStandardMaterial({ color: '#2e3f52', metalness: 0.88, roughness: 0.22 }),
  steelLight:new THREE.MeshStandardMaterial({ color: '#4a6080', metalness: 0.85, roughness: 0.2 }),
  chrome:    new THREE.MeshStandardMaterial({ color: '#b0c4d8', metalness: 0.98, roughness: 0.05 }),
  wood:      new THREE.MeshStandardMaterial({ color: '#8b6914', metalness: 0.0,  roughness: 0.85 }),
  woodDark:  new THREE.MeshStandardMaterial({ color: '#6b4f10', metalness: 0.0,  roughness: 0.9  }),
  baseMetal: new THREE.MeshStandardMaterial({ color: '#3a4a5c', metalness: 0.75, roughness: 0.35 }),
  accent:    new THREE.MeshStandardMaterial({ color: '#0ea5e9', metalness: 0.7,  roughness: 0.3, emissive: '#0ea5e9', emissiveIntensity: 0.15 }),
};

/* ─── Sm shkalalar ustun yuzasida ────────────────────────── */
function ScaleMarks({ x }) {
  const marks = [];
  const side  = x > 0 ? 1 : -1;
  const baseX = x + side * 0.052;

  for (let cm = 10; cm <= REAL_CM - 10; cm += 10) {
    // sm → 3D pozitsiya: 0 sm=0, 200 sm=COL_H
    const y     = (cm / REAL_CM) * COL_H;
    const is100 = cm % 100 === 0;
    const is50  = cm % 50  === 0;
    const w     = is100 ? 0.055 : is50 ? 0.038 : 0.022;
    const h     = is100 ? 0.005 : is50 ? 0.004 : 0.003;
    const alpha = is100 ? 0.50  : is50 ? 0.32  : 0.16;

    marks.push(
      <mesh key={cm} position={[baseX + side * (w / 2 - 0.001), y, 0]}>
        <boxGeometry args={[w, h, 0.007]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={alpha} depthWrite={false} />
      </mesh>
    );
  }
  return <>{marks}</>;
}

/* ─── Column — yashil belgi + sm shkalalar ───────────────── */
function Column({ x, barCm }) {
  const barY  = (barCm / REAL_CM) * COL_H;
  const gap   = 0.1;
  const clampedBarY = Math.min(Math.max(barY, gap + 0.02), COL_H - gap - 0.02);
  const botH  = clampedBarY - gap;
  const topH  = COL_H - clampedBarY - gap;

  const greenRef = useRef();
  const timerRef = useRef(null);
  const [showPopup, setShowPopup] = useState(false);
  const [hovered,   setHovered]   = useState(false);

  useFrame(() => {
    if (greenRef.current) {
      greenRef.current.material.emissiveIntensity =
        hovered ? 1.0 : 0.45 + 0.45 * Math.sin(Date.now() * 0.0025);
    }
  });

  const handleClick = (e) => {
    e.stopPropagation();
    setShowPopup(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowPopup(false), 3500);
  };

  return (
    <group>
      {/* Pastki qism */}
      <mesh material={MAT.steelDark} position={[x, botH / 2, 0]}>
        <boxGeometry args={[0.1, Math.max(0.01, botH), 0.1]} />
      </mesh>

      {/* Yashil qism — shtanga turgan joy (clickable) */}
      <mesh
        ref={greenRef}
        position={[x, clampedBarY, 0]}
        onClick={handleClick}
        onPointerEnter={() => { setHovered(true);  document.body.style.cursor = 'pointer'; }}
        onPointerLeave={() => { setHovered(false); document.body.style.cursor = 'default'; }}
      >
        <boxGeometry args={[0.1, gap * 2, 0.1]} />
        <meshStandardMaterial
          color="#22c55e" emissive="#22c55e"
          emissiveIntensity={0.6} metalness={0.4} roughness={0.3}
        />
      </mesh>

      {/* Marker popup */}
      {showPopup && (
        <Html
          position={[x, clampedBarY + 0.38, 0.12]}
          center
          distanceFactor={5}
          zIndexRange={[200, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            position: 'relative',
            background: 'rgba(3,14,6,0.93)',
            border: '1.5px solid #16a34a',
            borderRadius: 10,
            padding: '10px 16px',
            whiteSpace: 'nowrap',
            boxShadow: '0 6px 24px rgba(22,163,74,0.45)',
            fontFamily: "'Roboto', -apple-system, sans-serif",
            textAlign: 'center',
            minWidth: 100,
          }}>
            <div style={{ fontSize: 10, color: '#4ade80', fontWeight: 700, letterSpacing: 1.2, marginBottom: 4, textTransform: 'uppercase' }}>
              Balandlik
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
              <span style={{ fontSize: 26, fontWeight: 900, color: '#4ade80', lineHeight: 1 }}>{Math.round(barCm)}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#16a34a' }}>sm</span>
            </div>
            <div style={{ fontSize: 9, color: '#166534', marginTop: 3, letterSpacing: 0.5 }}>
              Ustun pastidan
            </div>
            <div style={{
              position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
              width: 0, height: 0,
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '8px solid #16a34a',
            }} />
          </div>
        </Html>
      )}

      {/* Yuqori qism */}
      <mesh material={MAT.steelDark} position={[x, clampedBarY + gap + topH / 2, 0]}>
        <boxGeometry args={[0.1, Math.max(0.01, topH), 0.1]} />
      </mesh>

      {/* Chrome guide rail */}
      <mesh material={MAT.chrome} position={[x + (x > 0 ? -0.055 : 0.055), COL_H / 2, 0]}>
        <boxGeometry args={[0.016, COL_H - 0.05, 0.016]} />
      </mesh>

      <ScaleMarks x={x} />

      {/* Base foot plate */}
      <mesh material={MAT.steelMid} position={[x, 0.04, 0]}>
        <boxGeometry args={[0.22, 0.08, 0.22]} />
      </mesh>
      {/* Top cap */}
      <mesh material={MAT.steelMid} position={[x, COL_H + 0.05, 0]}>
        <boxGeometry args={[0.16, 0.1, 0.16]} />
      </mesh>
    </group>
  );
}

/* ─── Wooden platform — kenglik ustunlar bilan bir xil ───── */
function Platform() {
  const W = 2.0;   // platforma kengligi (ustunlar: ±1.0)
  const D = 1.7;   // platforma chuqurligi (old-orqa)
  const slats = [];
  const count = 18;
  const slotW = D / count;

  for (let i = 0; i < count; i++) {
    const z = -D / 2 + i * slotW + slotW / 2;
    slats.push(
      <mesh key={i} material={i % 2 === 0 ? MAT.wood : MAT.woodDark}
        position={[0, 0.04, z]}>
        <boxGeometry args={[W - 0.12, 0.05, slotW - 0.006]} />
      </mesh>
    );
  }

  return (
    <group>
      {/* Metal base slab */}
      <mesh material={MAT.baseMetal} position={[0, -0.02, 0]}>
        <boxGeometry args={[W, 0.06, D]} />
      </mesh>
      {/* Wooden deck */}
      {slats}
      {/* Side lips */}
      <mesh material={MAT.steelDark} position={[-(W / 2 + 0.02), 0.0, 0]}>
        <boxGeometry args={[0.04, 0.1, D + 0.04]} />
      </mesh>
      <mesh material={MAT.steelDark} position={[W / 2 + 0.02, 0.0, 0]}>
        <boxGeometry args={[0.04, 0.1, D + 0.04]} />
      </mesh>
      {/* Front/back lips */}
      <mesh material={MAT.steelDark} position={[0, 0.0, -(D / 2 + 0.02)]}>
        <boxGeometry args={[W + 0.04, 0.1, 0.04]} />
      </mesh>
      <mesh material={MAT.steelDark} position={[0, 0.0, D / 2 + 0.02]}>
        <boxGeometry args={[W + 0.04, 0.1, 0.04]} />
      </mesh>
      {/* Leveling feet (4 corners) */}
      {[[-0.88, -0.72], [-0.88, 0.72], [0.88, -0.72], [0.88, 0.72]].map(([fx, fz], i) => (
        <group key={i} position={[fx, -0.09, fz]}>
          <mesh material={MAT.steelMid}>
            <cylinderGeometry args={[0.04, 0.05, 0.1, 10]} />
          </mesh>
          <mesh material={MAT.steelDark} position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.018, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ─── Fixed horizontal bar ───────────────────────────────── */

function HorizontalBar({ barCm }) {
  const barY = (barCm / REAL_CM) * COL_H;
  return (
    <group position={[0, barY, 0]}>
      {/* Main straight chrome bar */}
      <mesh material={MAT.chrome} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 1.95, 20]} />
      </mesh>
      {/* Knurling rings — grip zone */}
      {[-0.22, -0.11, 0, 0.11, 0.22].map((x, i) => (
        <mesh key={i} material={MAT.steelMid} position={[x, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.028, 0.028, 0.04, 14]} />
        </mesh>
      ))}
      {/* End collars */}
      {[-0.935, 0.935].map((x, i) => (
        <mesh key={i} material={MAT.steelDark} position={[x, 0, 0]}
          rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.036, 0.036, 0.055, 14]} />
        </mesh>
      ))}
      {/* Bracket (ustun bilan birikish nuqtasi) */}
      {[-1.0, 1.0].map((x, i) => (
        <mesh key={i} material={MAT.steelMid} position={[x, 0, 0]}>
          <boxGeometry args={[0.065, 0.1, 0.075]} />
        </mesh>
      ))}
    </group>
  );
}


/* ─── Top crossbeam ───────────────────────────────────────── */
function TopFrame() {
  return (
    <group>
      <mesh material={MAT.steelDark} position={[0, COL_H + 0.1, 0]}>
        <boxGeometry args={[2.1, 0.09, 0.09]} />
      </mesh>
      {[-1.0, 1.0].map((x, i) => (
        <mesh key={i} material={MAT.steelMid} position={[x, COL_H + 0.07, 0]}>
          <boxGeometry args={[0.12, 0.22, 0.12]} />
        </mesh>
      ))}
    </group>
  );
}

/* ─── Sensor indicators on platform ──────────────────────── */
function SensorDots({ isActive }) {
  const ref = useRef();
  useFrame(() => {
    if (ref.current) {
      ref.current.children.forEach((c, i) => {
        if (c.material) {
          const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.003 + i * 1.2);
          c.material.emissiveIntensity = isActive ? 0.4 + pulse * 0.8 : 0.1;
        }
      });
    }
  });
  const positions = [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]];
  return (
    <group ref={ref}>
      {positions.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.075, z]}>
          <cylinderGeometry args={[0.03, 0.03, 0.008, 10]} />
          <meshStandardMaterial
            color={isActive ? '#22c55e' : '#ef4444'}
            emissive={isActive ? '#22c55e' : '#ef4444'}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}
    </group>
  );
}

/* ─── Full UDS machine ────────────────────────────────────── */
function UDSMachine({ isActive, barCm }) {
  return (
    <group position={[0, -1.45, 0]}>
      <Platform />
      <Column x={-1.0} barCm={barCm} />
      <Column x={1.0}  barCm={barCm} />
      <TopFrame />
      <HorizontalBar barCm={barCm} />
      <SensorDots isActive={isActive} />
    </group>
  );
}


/* ─── Room (pol, devorlar, shift) ─────────────────────────── */
function Room({ isDark }) {
  const H     = CEIL_Y - FLOOR_Y;
  const midY  = FLOOR_Y + H / 2;
  const wallC = isDark ? '#3a4050' : '#9a9ea6';
  const ceilC = wallC;
  const baseC = isDark ? '#0a1018' : '#aab4bc';

  return (
    <group>
      {/* Yagona rangdagi pol */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial
          color={isDark ? '#3a3a3a' : '#5a5a5a'}
          metalness={0.06} roughness={0.85}
        />
      </mesh>

      {/* Rezina gilam (mashina ostida) */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, FLOOR_Y + 0.004, 0]}>
        <planeGeometry args={[3.0, 2.5]} />
        <meshStandardMaterial color="#191919" metalness={0.0} roughness={0.97} />
      </mesh>
      {/* Gilam sariq chegarasi */}
      {[
        { x: 0,    z: -1.25, w: 3.0,  d: 0.04 },
        { x: 0,    z:  1.25, w: 3.0,  d: 0.04 },
        { x: -1.5, z:  0,    w: 0.04, d: 2.5  },
        { x:  1.5, z:  0,    w: 0.04, d: 2.5  },
      ].map((ln, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[ln.x, FLOOR_Y + 0.006, ln.z]}>
          <planeGeometry args={[ln.w, ln.d]} />
          <meshStandardMaterial color="#e6c020" roughness={0.9} />
        </mesh>
      ))}

      {/* Orqa devor */}
      <mesh receiveShadow position={[0, FLOOR_Y + H / 2, -ROOM_D / 2]}>
        <planeGeometry args={[ROOM_W, H]} />
        <meshStandardMaterial color={wallC} roughness={0.9} />
      </mesh>

      {/* Chap devor */}
      <mesh receiveShadow position={[-ROOM_W / 2, midY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM_D, H]} />
        <meshStandardMaterial color={wallC} roughness={0.9} />
      </mesh>
      {/* O'ng devor */}
      <mesh receiveShadow position={[ROOM_W / 2, midY, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[ROOM_D, H]} />
        <meshStandardMaterial color={wallC} roughness={0.9} />
      </mesh>

      {/* Shift */}
      <mesh position={[0, CEIL_Y, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM_W, ROOM_D]} />
        <meshStandardMaterial color={ceilC} roughness={0.9} />
      </mesh>

      {/* Plintuslar */}
      <mesh position={[0, FLOOR_Y + 0.09, -ROOM_D / 2 + 0.04]}>
        <boxGeometry args={[ROOM_W, 0.18, 0.06]} />
        <meshStandardMaterial color={baseC} />
      </mesh>
      <mesh position={[-ROOM_W / 2 + 0.04, FLOOR_Y + 0.09, 0]}>
        <boxGeometry args={[0.06, 0.18, ROOM_D]} />
        <meshStandardMaterial color={baseC} />
      </mesh>
      <mesh position={[ROOM_W / 2 - 0.04, FLOOR_Y + 0.09, 0]}>
        <boxGeometry args={[0.06, 0.18, ROOM_D]} />
        <meshStandardMaterial color={baseC} />
      </mesh>
    </group>
  );
}

/* ─── Shift LED chiroqlari ────────────────────────────────── */
function CeilingLights({ isDark }) {
  const fixtures = [
    { x:  0,   z:  0.5 },
    { x: -2.2, z: -1.5 },
    { x:  2.2, z: -1.5 },
  ];
  return (
    <>
      {fixtures.map(({ x, z }, i) => (
        <group key={i} position={[x, CEIL_Y - 0.02, z]}>
          <mesh>
            <boxGeometry args={[0.9, 0.03, 0.3]} />
            <meshStandardMaterial
              color="#ddeeff"
              emissive="#ddeeff"
              emissiveIntensity={isDark ? 1.1 : 0.22}
            />
          </mesh>
          <pointLight
            position={[0, -0.4, 0]}
            intensity={isDark ? (i === 0 ? 2.4 : 1.5) : (i === 0 ? 1.1 : 0.65)}
            color="#f2f6ff"
            distance={8}
            decay={2}
            castShadow={i === 0}
            shadow-mapSize-width={512}
            shadow-mapSize-height={512}
          />
        </group>
      ))}
    </>
  );
}

/* ─── Ma'lumot simulyatori: og'irlik har 6s, balandlik har 30s ─ */
function DataEventSimulator({ onWeightEvent, onHeightEvent, onBarUpdate }) {
  const wTimerRef    = useRef(0);
  const hTimerRef    = useRef(0);
  const weightRef    = useRef(75);
  const targetCmRef  = useRef(120);
  const currentCmRef = useRef(120);
  const lastTickRef  = useRef(0);

  useFrame((_, delta) => {
    currentCmRef.current += (targetCmRef.current - currentCmRef.current) * Math.min(1, delta * 1.8);
    wTimerRef.current += delta;
    hTimerRef.current += delta;

    if (wTimerRef.current >= 6) {
      wTimerRef.current = 0;
      weightRef.current = 50 + Math.round(Math.random() * 100);
      onWeightEvent(weightRef.current);
    }

    if (hTimerRef.current >= 30) {
      hTimerRef.current = 0;
      const goDown = targetCmRef.current > 110;
      targetCmRef.current = goDown ? 40 + Math.random() * 50 : 130 + Math.random() * 65;
      onHeightEvent(Math.round(targetCmRef.current));
    }

    const now = Date.now();
    if (now - lastTickRef.current > 33) {
      lastTickRef.current = now;
      onBarUpdate(Math.round(currentCmRef.current * 10) / 10, weightRef.current);
    }
  });

  return null;
}

/* ─── Left stats panel ────────────────────────────────────── */
function StatsPanel({ isDark, barCm, weight, heightCardRef, weightCardRef }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const card = {
    background: isDark ? 'rgba(10,20,40,0.82)' : 'rgba(255,255,255,0.88)',
    border: `1px solid ${isDark ? 'rgba(2,132,199,0.35)' : 'rgba(2,132,199,0.25)'}`,
    borderRadius: 14, padding: '16px 18px',
    backdropFilter: 'blur(16px)',
    boxShadow: isDark ? '0 4px 24px rgba(0,0,0,0.5)' : '0 4px 24px rgba(0,0,0,0.12)',
  };
  const label = { fontSize: 13, color: '#0284c7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 };
  const muted  = { color: isDark ? '#94a3b8' : '#64748b' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 230 }}>
      {/* Tizim holati */}
      <div style={card}>
        <div style={{ ...label, marginBottom: 10 }}>Tizim holati</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', boxShadow: '0 0 8px #16a34a' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#16a34a' }}>Online · Faol</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{time.toLocaleTimeString('uz-UZ')}</div>
        <div style={{ fontSize: 13, ...muted, marginTop: 2 }}>{time.toLocaleDateString('uz-UZ')}</div>
      </div>

      {/* UDS ko'rsatkichlari */}
      <div style={card}>
        <div style={{ ...label, marginBottom: 12 }}>UDS ko'rsatkichlari</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div ref={heightCardRef} style={{ flex: 1, textAlign: 'center', background: isDark ? 'rgba(2,100,160,0.20)' : 'rgba(2,100,160,0.08)', borderRadius: 10, padding: '10px 0', border: '1px solid rgba(2,132,199,0.25)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0284c7', fontVariantNumeric: 'tabular-nums' }}>{Math.round(barCm)}</div>
            <div style={{ fontSize: 11, ...muted, marginTop: 2 }}>sm · Balandlik</div>
          </div>
          <div ref={weightCardRef} style={{ flex: 1, textAlign: 'center', background: isDark ? 'rgba(109,40,217,0.18)' : 'rgba(109,40,217,0.07)', borderRadius: 10, padding: '10px 0', border: '1px solid rgba(109,40,217,0.28)' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#7c3aed', fontVariantNumeric: 'tabular-nums' }}>{weight}</div>
            <div style={{ fontSize: 11, ...muted, marginTop: 2 }}>kg · Og'irlik</div>
          </div>
        </div>
      </div>
    </div>
  );
}


/* ─── Shtanga ekran pozitsiyasini kuzatuvchi (Canvas ichida) ─ */
function BarPositionTracker({ barCm, screenPosRef }) {
  const { camera, size } = useThree();
  const vec = useRef(new THREE.Vector3());

  useFrame(() => {
    const worldY = -1.45 + (barCm / REAL_CM) * COL_H;
    vec.current.set(-1.0, worldY, 0);
    vec.current.project(camera);
    screenPosRef.current = {
      x: (vec.current.x + 1) / 2 * size.width,
      y: (-vec.current.y + 1) / 2 * size.height,
    };
  });

  return null;
}

/* ─── Diskret paket animatsiyasi (SVG overlay, RAF-based) ───────── */
function DataFlowOverlay({ packets, heightCardRef, weightCardRef }) {
  const svgRef    = useRef();
  const activeRef = useRef(new Map()); // id → { startTime, sx, sy, tx, ty, type }

  // Yangi paket kelganda maqsad nuqtasini hisoblaydi va ro'yxatga qo'shadi
  useEffect(() => {
    packets.forEach(({ id, type, sx, sy }) => {
      if (activeRef.current.has(id)) return;
      let tx = 180, ty = 380;
      const tRef = type === 'weight' ? weightCardRef : heightCardRef;
      if (tRef?.current) {
        const r = tRef.current.getBoundingClientRect();
        tx = r.left + r.width / 2;
        ty = r.top + r.height / 2;
      }
      activeRef.current.set(id, { startTime: performance.now(), sx, sy, tx, ty, type });
    });
  }, [packets, heightCardRef, weightCardRef]);

  // Doimiy animatsiya sikli
  useEffect(() => {
    const DURATION = 900;
    let rafId;

    const tick = (now) => {
      if (svgRef.current) {
        activeRef.current.forEach(({ startTime, sx, sy, tx, ty, type }, id) => {
          const t = Math.min(1, (now - startTime) / DURATION);
          const mx = sx - 90;
          const my = (sy + ty) / 2 - 70;
          const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * mx + t * t * tx;
          const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * my + t * t * ty;
          const opacity = t < 0.08 ? t / 0.08 : t > 0.85 ? (1 - t) / 0.15 : 1;

          let el = svgRef.current.querySelector(`[data-pid="${id}"]`);
          if (!el) {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            el.setAttribute('data-pid', id);
            el.setAttribute('r', '5');
            el.setAttribute('fill', type === 'weight' ? '#a855f7' : '#38bdf8');
            svgRef.current.appendChild(el);
          }
          el.setAttribute('cx', px);
          el.setAttribute('cy', py);
          el.setAttribute('opacity', opacity);

          if (t >= 1) {
            el.remove();
            activeRef.current.delete(id);
          }
        });
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <svg ref={svgRef} style={{ position: 'absolute', inset: 0, zIndex: 15, pointerEvents: 'none', width: '100%', height: '100%' }} />
  );
}

/* ─── Shtanga ustidagi yonuvchi nuqta (Canvas ichida) ────────── */
function BarGlowDot({ barCm }) {
  const dotRef = useRef();
  const worldY = -1.45 + (barCm / REAL_CM) * COL_H;

  useFrame(() => {
    if (dotRef.current) {
      const s = 0.7 + 0.3 * Math.sin(Date.now() * 0.005);
      dotRef.current.style.transform = `translate(-50%,-50%) scale(${s})`;
      dotRef.current.style.opacity   = 0.6 + 0.4 * s;
    }
  });

  return (
    <Html position={[-1.0, worldY, 0.08]} style={{ pointerEvents: 'none' }}>
      <div ref={dotRef} style={{
        width: 14, height: 14, borderRadius: '50%',
        background: '#38bdf8',
        boxShadow: '0 0 14px #38bdf8, 0 0 6px #fff',
        transform: 'translate(-50%,-50%)',
      }} />
    </Html>
  );
}

/* ─── Main Dashboard page ─────────────────────────────────── */
export default function NazoratchiDashboard() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isActive] = useState(true);
  const [barCm,  setBarCm]  = useState(120);
  const [weight, setWeight] = useState(75);
  const [packets, setPackets] = useState([]);

  const barScreenPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const heightCardRef   = useRef();
  const weightCardRef   = useRef();
  const packetIdRef     = useRef(0);

  const addPacket = (type) => {
    const { x: sx, y: sy } = barScreenPosRef.current;
    const id = ++packetIdRef.current;
    setPackets(prev => [...prev, { id, type, sx, sy }]);
    setTimeout(() => setPackets(prev => prev.filter(p => p.id !== id)), 950);
  };

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>

      {/* To'liq ekran 3D canvas */}
      <div style={{ position: 'absolute', inset: 0 }}>
        <Canvas shadows>
          <PerspectiveCamera makeDefault position={[2.4, 1.2, 4.2]} fov={46} />
          <OrbitControls
            enablePan={false}
            minDistance={3}
            maxDistance={10}
            minPolarAngle={Math.PI / 8}
            maxPolarAngle={Math.PI / 2.05}
          />

          <ambientLight intensity={isDark ? 0.28 : 0.55} color={isDark ? '#b0c0d8' : '#ffffff'} />
          <directionalLight
            position={[3, 6, 2]}
            intensity={isDark ? 0.5 : 1.2}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-near={0.5}
            shadow-camera-far={30}
            shadow-camera-left={-7}
            shadow-camera-right={7}
            shadow-camera-top={7}
            shadow-camera-bottom={-3}
            color={isDark ? '#a0b8d0' : '#fff8f0'}
          />
          <directionalLight position={[-5, 3, 1]} intensity={isDark ? 0.1 : 0.45} color={isDark ? '#304870' : '#d0e4ff'} />
          <directionalLight position={[ 5, 3, 1]} intensity={isDark ? 0.1 : 0.45} color={isDark ? '#304870' : '#d0e4ff'} />

          <CeilingLights isDark={isDark} />
          <DataEventSimulator
            onWeightEvent={(kg) => { setWeight(kg); addPacket('weight'); }}
            onHeightEvent={(cm) => { setBarCm(cm);  addPacket('height'); }}
            onBarUpdate={(cm, kg)  => { setBarCm(cm); setWeight(kg); }}
          />
          <Room isDark={isDark} />
          <UDSMachine isActive={isActive} barCm={barCm} />

          {/* Shtanga pozitsiyasini ekran koordinatasiga o'tkazuvchi */}
          <BarPositionTracker barCm={barCm} screenPosRef={barScreenPosRef} />
          {/* Shtanga ustidagi yonuvchi nuqta */}
          <BarGlowDot barCm={barCm} />
        </Canvas>
      </div>

      {/* Diskret paketlar animatsiyasi */}
      <DataFlowOverlay packets={packets} heightCardRef={heightCardRef} weightCardRef={weightCardRef} />

      {/* Chap tomonda suzuvchi stats panel */}
      <div style={{ position: 'absolute', top: 24, left: 24, zIndex: 20, pointerEvents: 'auto' }}>
        <StatsPanel
          isDark={isDark} barCm={barCm} weight={weight}
          heightCardRef={heightCardRef} weightCardRef={weightCardRef}
        />
      </div>

      {/* Pastki hint */}
      <div style={{ position: 'absolute', bottom: 16, left: 0, right: 0, textAlign: 'center', zIndex: 10, pointerEvents: 'none' }}>
        <div style={{ fontSize: 13, color: isDark ? '#3a5878' : '#64748b' }}>
          🖱️ Sichqoncha bilan aylantiring · Scroll — zoom
        </div>
      </div>

    </div>
  );
}
