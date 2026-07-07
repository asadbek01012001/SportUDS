import { useRef, useState, useEffect, useCallback } from 'react';
import { Modal, message, Select, Button, Empty } from 'antd';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import api, { devicesAPI } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';

/* ── Leaflet icon fix ── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

/* ═══════════════════════════════════════════════════════
   MA'LUMOTLAR
═══════════════════════════════════════════════════════ */
const ATHLETES = [
  { id: 1, name: 'Jasur Toshmatov',    sport: "Og'ir atletika", weight: 85, age: 22 },
  { id: 2, name: 'Dilnoza Yusupova',   sport: 'Kurash',         weight: 62, age: 19 },
  { id: 3, name: 'Bobur Xasanov',      sport: 'Boks',           weight: 75, age: 25 },
  { id: 4, name: 'Malika Rahimova',    sport: 'Gimnastika',     weight: 58, age: 21 },
  { id: 5, name: 'Sherzod Mirzayev',   sport: 'Yengil atletika',weight: 70, age: 23 },
  { id: 6, name: 'Gulnora Karimova',   sport: 'Suzish',         weight: 65, age: 20 },
  { id: 7, name: 'Akbar Nazarov',      sport: 'Kurash',         weight: 90, age: 24 },
  { id: 8, name: 'Zulfiya Abdullayeva',sport: 'Tennis',         weight: 60, age: 18 },
  { id: 9, name: 'Firdavs Razzaqov',   sport: "Og'ir atletika", weight: 95, age: 26 },
];

const ZALLAR = [
  {
    id: 1, name: 'Yunusobod Sport Markazi',
    address: 'Yunusobod tumani, 5-mavze, 15-uy', phone: '+998 71 123-45-67',
    lat: 41.3567, lng: 69.2836,
    trinajorlar: [
      { id: 1, name: 'UDS #1', barCm: 120, status: 'faol',   athleteId: 1 },
      { id: 2, name: 'UDS #2', barCm: 95,  status: 'faol',   athleteId: 2 },
      { id: 3, name: 'UDS #3', barCm: 150, status: 'texnik', athleteId: null },
    ],
  },
  {
    id: 2, name: 'Chilonzor Olimpiya Zali',
    address: 'Chilonzor tumani, 9-kvartal', phone: '+998 71 234-56-78',
    lat: 41.2995, lng: 69.2401,
    trinajorlar: [
      { id: 1, name: 'UDS #1', barCm: 130, status: 'faol',   athleteId: 4 },
      { id: 2, name: 'UDS #2', barCm: 85,  status: 'faol',   athleteId: 5 },
      { id: 3, name: 'UDS #3', barCm: 115, status: 'faol',   athleteId: 8 },
    ],
  },
  {
    id: 3, name: 'Mirzo Ulugbek Sport Zali',
    address: "Mirzo Ulugbek tumani, Universitet ko'chasi", phone: '+998 71 345-67-89',
    lat: 41.3412, lng: 69.3280,
    trinajorlar: [
      { id: 1, name: 'UDS #1', barCm: 100, status: 'faol',   athleteId: 6 },
      { id: 2, name: 'UDS #2', barCm: 140, status: 'texnik', athleteId: null },
      { id: 3, name: 'UDS #3', barCm: 115, status: 'faol',   athleteId: 7 },
    ],
  },
];

/* ── UDS formulalar ── */
function calcUDS(barCm, bodyWeight, Fmax, tmax) {
  const h    = barCm / 100;                          // m
  const m    = bodyWeight;
  const g    = 9.81;
  const P0   = +(m * g * h).toFixed(1);              // J  — boshlang'ich energiya
  const J    = +(Fmax / tmax).toFixed(1);            // N/s — kuch impulsi
  const Q    = +(Fmax / (m * g)).toFixed(2);         // — nisbiy kuch
  const G    = +((Fmax - m * g) / (m * g) * 100).toFixed(1); // % portlovchi kuch
  const Vmax = +(h / tmax).toFixed(2);               // m/s
  const Nmax = +(Fmax * Vmax).toFixed(0);            // W — quvvat
  return { P0, J, Q, G, Vmax, Nmax };
}

/* ── Har bir faol trinajor uchun boshlang'ich live holat ── */
function initSession(trinajor) {
  const a = ATHLETES.find(a => a.id === trinajor.athleteId);
  if (!a) return null;
  const Fmax = +(a.weight * 9.81 * (1.1 + Math.random() * 0.4)).toFixed(1);
  const tmax = +(0.28 + Math.random() * 0.35).toFixed(3);
  return {
    barCm:    trinajor.barCm,
    Fmax,
    tmax,
    attempts: Math.floor(Math.random() * 4) + 1,
    elapsed:  Math.floor(Math.random() * 1500) + 120, // allaqachon 2-27 daqiqa
    ...calcUDS(trinajor.barCm, a.weight, Fmax, tmax),
  };
}

/* nechta trinajor → nechta ustun */
function gridCols(n) {
  if (n === 1) return 1;
  if (n <= 4) return 2;
  return 3;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

const MARKER_COLOR = '#6366f1';

/* ── Kichik, bir xil rangli SVG pin ── */
function makeIcon(active) {
  const fill   = active ? '#818cf8' : MARKER_COLOR;
  const shadow = active ? '0 0 0 4px rgba(99,102,241,0.25)' : 'none';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="30" viewBox="0 0 22 30">
    <filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#0004"/></filter>
    <path filter="url(#sh)" d="M11 1C6.03 1 2 5.03 2 10c0 6.5 9 19 9 19s9-12.5 9-19c0-4.97-4.03-9-9-9z" fill="${fill}"/>
    <circle cx="11" cy="10" r="4" fill="#fff" opacity="0.95"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [22, 30], iconAnchor: [11, 30], popupAnchor: [0, -32] });
}

/* ── FlyTo helper ── */
function FlyTo({ lat, lng }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], 14, { duration: 0.9 }); }, [lat, lng, map]);
  return null;
}

/* ═══════════════════════════════════════════════════════
   3D KOMPONENTLAR
═══════════════════════════════════════════════════════ */
const COL_H = 3.0, REAL_CM = 200, FLOOR_Y = -1.65, CEIL_Y = 4.3, ROOM_W = 11, ROOM_D = 10;

const MAT = {
  steelDark: new THREE.MeshStandardMaterial({ color: '#1e2a38', metalness: 0.92, roughness: 0.18 }),
  steelMid:  new THREE.MeshStandardMaterial({ color: '#2e3f52', metalness: 0.88, roughness: 0.22 }),
  chrome:    new THREE.MeshStandardMaterial({ color: '#b0c4d8', metalness: 0.98, roughness: 0.05 }),
  wood:      new THREE.MeshStandardMaterial({ color: '#8b6914', metalness: 0.0,  roughness: 0.85 }),
  woodDark:  new THREE.MeshStandardMaterial({ color: '#6b4f10', metalness: 0.0,  roughness: 0.9  }),
  baseMetal: new THREE.MeshStandardMaterial({ color: '#3a4a5c', metalness: 0.75, roughness: 0.35 }),
};

function ScaleMarks({ x }) {
  const side = x > 0 ? 1 : -1, baseX = x + side * 0.052, marks = [];
  for (let cm = 10; cm <= REAL_CM - 10; cm += 10) {
    const y = (cm / REAL_CM) * COL_H, is100 = cm%100===0, is50 = cm%50===0;
    marks.push(
      <mesh key={cm} position={[baseX + side*((is100?.055:is50?.038:.022)/2-.001), y, 0]}>
        <boxGeometry args={[is100?.055:is50?.038:.022, is100?.005:is50?.004:.003, .007]} />
        <meshStandardMaterial color="#94a3b8" transparent opacity={is100?.5:is50?.32:.16} depthWrite={false} />
      </mesh>
    );
  }
  return <>{marks}</>;
}

function Column({ x, barCm }) {
  const barY = (barCm/REAL_CM)*COL_H, gap = .1;
  const cy = Math.min(Math.max(barY, gap+.02), COL_H-gap-.02);
  const botH = cy-gap, topH = COL_H-cy-gap;
  const ref = useRef();
  useFrame(() => { if (ref.current) ref.current.material.emissiveIntensity = .45+.45*Math.sin(Date.now()*.0025); });
  return (
    <group>
      <mesh material={MAT.steelDark} position={[x, botH/2, 0]}><boxGeometry args={[.1, Math.max(.01,botH), .1]} /></mesh>
      <mesh ref={ref} position={[x, cy, 0]}>
        <boxGeometry args={[.1, gap*2, .1]} />
        <meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={.6} metalness={.4} roughness={.3} />
      </mesh>
      <mesh material={MAT.steelDark} position={[x, cy+gap+topH/2, 0]}><boxGeometry args={[.1, Math.max(.01,topH), .1]} /></mesh>
      <mesh material={MAT.chrome} position={[x+(x>0?-.055:.055), COL_H/2, 0]}><boxGeometry args={[.016, COL_H-.05, .016]} /></mesh>
      <ScaleMarks x={x} />
      <mesh material={MAT.steelMid} position={[x, .04, 0]}><boxGeometry args={[.22,.08,.22]} /></mesh>
      <mesh material={MAT.steelMid} position={[x, COL_H+.05, 0]}><boxGeometry args={[.16,.1,.16]} /></mesh>
    </group>
  );
}

function Platform() {
  const W=2, D=1.7, count=18, sw=D/count;
  return (
    <group>
      <mesh material={MAT.baseMetal} position={[0,-.02,0]}><boxGeometry args={[W,.06,D]} /></mesh>
      {Array.from({length:count},(_,i)=><mesh key={i} material={i%2===0?MAT.wood:MAT.woodDark} position={[0,.04,-D/2+i*sw+sw/2]}><boxGeometry args={[W-.12,.05,sw-.006]} /></mesh>)}
      <mesh material={MAT.steelDark} position={[-(W/2+.02),0,0]}><boxGeometry args={[.04,.1,D+.04]} /></mesh>
      <mesh material={MAT.steelDark} position={[W/2+.02,0,0]}><boxGeometry args={[.04,.1,D+.04]} /></mesh>
      <mesh material={MAT.steelDark} position={[0,0,-(D/2+.02)]}><boxGeometry args={[W+.04,.1,.04]} /></mesh>
      <mesh material={MAT.steelDark} position={[0,0,D/2+.02]}><boxGeometry args={[W+.04,.1,.04]} /></mesh>
      {[[-0.88,-0.72],[-0.88,0.72],[0.88,-0.72],[0.88,0.72]].map(([fx,fz],i)=>(
        <group key={i} position={[fx,-.09,fz]}>
          <mesh material={MAT.steelMid}><cylinderGeometry args={[.04,.05,.1,10]} /></mesh>
          <mesh material={MAT.steelDark} position={[0,-.06,0]}><cylinderGeometry args={[.06,.06,.018,12]} /></mesh>
        </group>
      ))}
    </group>
  );
}

function HorizontalBar({ barCm }) {
  const barY = (barCm/REAL_CM)*COL_H;
  return (
    <group position={[0,barY,0]}>
      <mesh material={MAT.chrome} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.025,.025,1.95,20]} /></mesh>
      {[-0.22,-0.11,0,0.11,0.22].map((x,i)=><mesh key={i} material={MAT.steelMid} position={[x,0,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.028,.028,.04,14]} /></mesh>)}
      {[-0.935,0.935].map((x,i)=><mesh key={i} material={MAT.steelDark} position={[x,0,0]} rotation={[0,0,Math.PI/2]}><cylinderGeometry args={[.036,.036,.055,14]} /></mesh>)}
      {[-1,1].map((x,i)=><mesh key={i} material={MAT.steelMid} position={[x,0,0]}><boxGeometry args={[.065,.1,.075]} /></mesh>)}
    </group>
  );
}

function TopFrame() {
  return (
    <group>
      <mesh material={MAT.steelDark} position={[0,COL_H+.1,0]}><boxGeometry args={[2.1,.09,.09]} /></mesh>
      {[-1,1].map((x,i)=><mesh key={i} material={MAT.steelMid} position={[x,COL_H+.07,0]}><boxGeometry args={[.12,.22,.12]} /></mesh>)}
    </group>
  );
}

function SensorDots() {
  const ref = useRef();
  useFrame(()=>{ if(ref.current) ref.current.children.forEach((c,i)=>{ if(c.material){ const p=.5+.5*Math.sin(Date.now()*.003+i*1.2); c.material.emissiveIntensity=.4+p*.8; } }); });
  return (
    <group ref={ref}>
      {[[-0.4,-0.3],[0.4,-0.3],[-0.4,0.3],[0.4,0.3]].map(([x,z],i)=>(
        <mesh key={i} position={[x,.075,z]}><cylinderGeometry args={[.03,.03,.008,10]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={.3} /></mesh>
      ))}
    </group>
  );
}

function UDSMachine({ barCm }) {
  return (
    <group position={[0,-1.45,0]}>
      <Platform /><Column x={-1} barCm={barCm} /><Column x={1} barCm={barCm} />
      <TopFrame /><HorizontalBar barCm={barCm} /><SensorDots />
    </group>
  );
}

function Room({ isDark }) {
  const H=CEIL_Y-FLOOR_Y, midY=FLOOR_Y+H/2;
  const wallC=isDark?'#3a4050':'#9a9ea6', baseC=isDark?'#0a1018':'#aab4bc';
  return (
    <group>
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,FLOOR_Y,0]}><planeGeometry args={[ROOM_W,ROOM_D]} /><meshStandardMaterial color={isDark?'#3a3a3a':'#5a5a5a'} metalness={.06} roughness={.85} /></mesh>
      <mesh receiveShadow rotation={[-Math.PI/2,0,0]} position={[0,FLOOR_Y+.004,0]}><planeGeometry args={[3,2.5]} /><meshStandardMaterial color="#191919" roughness={.97} /></mesh>
      {[{x:0,z:-1.25,w:3,d:.04},{x:0,z:1.25,w:3,d:.04},{x:-1.5,z:0,w:.04,d:2.5},{x:1.5,z:0,w:.04,d:2.5}].map((l,i)=>(
        <mesh key={i} rotation={[-Math.PI/2,0,0]} position={[l.x,FLOOR_Y+.006,l.z]}><planeGeometry args={[l.w,l.d]} /><meshStandardMaterial color="#e6c020" roughness={.9} /></mesh>
      ))}
      <mesh receiveShadow position={[0,FLOOR_Y+H/2,-ROOM_D/2]}><planeGeometry args={[ROOM_W,H]} /><meshStandardMaterial color={wallC} roughness={.9} /></mesh>
      <mesh receiveShadow position={[-ROOM_W/2,midY,0]} rotation={[0,Math.PI/2,0]}><planeGeometry args={[ROOM_D,H]} /><meshStandardMaterial color={wallC} roughness={.9} /></mesh>
      <mesh receiveShadow position={[ROOM_W/2,midY,0]} rotation={[0,-Math.PI/2,0]}><planeGeometry args={[ROOM_D,H]} /><meshStandardMaterial color={wallC} roughness={.9} /></mesh>
      <mesh position={[0,CEIL_Y,0]} rotation={[Math.PI/2,0,0]}><planeGeometry args={[ROOM_W,ROOM_D]} /><meshStandardMaterial color={wallC} roughness={.9} /></mesh>
      {[[0,FLOOR_Y+.09,-ROOM_D/2+.04,[ROOM_W,.18,.06]],[-ROOM_W/2+.04,FLOOR_Y+.09,0,[.06,.18,ROOM_D]],[ROOM_W/2-.04,FLOOR_Y+.09,0,[.06,.18,ROOM_D]]].map(([px,py,pz,args],i)=>(
        <mesh key={i} position={[px,py,pz]}><boxGeometry args={args} /><meshStandardMaterial color={baseC} /></mesh>
      ))}
    </group>
  );
}

function CeilingLights({ isDark }) {
  return (
    <>{[{x:0,z:.5},{x:-2.2,z:-1.5},{x:2.2,z:-1.5}].map(({x,z},i)=>(
      <group key={i} position={[x,CEIL_Y-.02,z]}>
        <mesh><boxGeometry args={[.9,.03,.3]} /><meshStandardMaterial color="#ddeeff" emissive="#ddeeff" emissiveIntensity={isDark?1.1:.22} /></mesh>
        <pointLight position={[0,-.4,0]} intensity={isDark?(i===0?2.4:1.5):(i===0?1.1:.65)} color="#f2f6ff" distance={8} decay={2} castShadow={i===0} shadow-mapSize-width={512} shadow-mapSize-height={512} />
      </group>
    ))}</>
  );
}

/* ── Bitta trinajor uchun Canvas ── */
function TrinajorCanvas({ isDark, barCm }) {
  return (
    <Canvas shadows style={{ display: 'block', width: '100%', height: '100%' }}>
      <PerspectiveCamera makeDefault position={[2.4,1.2,4.2]} fov={46} />
      <OrbitControls enablePan={false} minDistance={3} maxDistance={10} minPolarAngle={Math.PI/8} maxPolarAngle={Math.PI/2.05} />
      <ambientLight intensity={isDark?.28:.55} color={isDark?'#b0c0d8':'#ffffff'} />
      <directionalLight position={[3,6,2]} intensity={isDark?.5:1.2} castShadow shadow-mapSize={[1024,1024]} shadow-camera-near={.5} shadow-camera-far={30} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-3} color={isDark?'#a0b8d0':'#fff8f0'} />
      <directionalLight position={[-5,3,1]} intensity={isDark?.1:.45} color={isDark?'#304870':'#d0e4ff'} />
      <directionalLight position={[5,3,1]}  intensity={isDark?.1:.45} color={isDark?'#304870':'#d0e4ff'} />
      <CeilingLights isDark={isDark} />
      <Room isDark={isDark} />
      <UDSMachine barCm={barCm} />
    </Canvas>
  );
}

/* ═══════════════════════════════════════════════════════
   ASOSIY SAHIFA
═══════════════════════════════════════════════════════ */
export default function Trinajorlar() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [activeZal,   setActiveZal]   = useState(null);
  const [flyTarget,   setFlyTarget]   = useState(null);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);

  /* ── Live ma'lumotlar: key = `${zalId}-${trinajorId}` ── */
  const [live, setLive] = useState(() => {
    const map = {};
    ZALLAR.forEach(z => z.trinajorlar.forEach(t => {
      if (t.status === 'faol') map[`${z.id}-${t.id}`] = initSession(t);
    }));
    return map;
  });

  /* ── Simulyatsiya: har 5s da barCm o'zgaradi, har 8s da Fmax yangilanadi, har sekund elapsed++ ── */
  useEffect(() => {
    const tick = setInterval(() => {
      setLive(prev => {
        const next = { ...prev };
        ZALLAR.forEach(z => z.trinajorlar.forEach(t => {
          if (t.status !== 'faol') return;
          const key = `${z.id}-${t.id}`;
          const cur  = prev[key];
          if (!cur) return;
          const athlete = ATHLETES.find(a => a.id === t.athleteId);
          const elapsed = cur.elapsed + 1;

          /* Har 8 sekundda yangi urinish simulyatsiyasi */
          const doAttempt = elapsed % 8 === 0;
          const barCm  = doAttempt ? 60 + Math.random() * 140 : cur.barCm + (Math.random() - 0.5) * 0.4;
          const Fmax   = doAttempt
            ? +(athlete.weight * 9.81 * (1.05 + Math.random() * 0.5)).toFixed(1)
            : cur.Fmax + (Math.random() - 0.5) * 2;
          const tmax   = doAttempt
            ? +(0.25 + Math.random() * 0.4).toFixed(3)
            : cur.tmax;
          const attempts = doAttempt ? cur.attempts + 1 : cur.attempts;
          const metrics  = calcUDS(barCm, athlete.weight, Fmax, tmax);
          next[key] = { barCm: +barCm.toFixed(1), Fmax: +Fmax.toFixed(1), tmax, elapsed, attempts, ...metrics };
        }));
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  /* ── Real trenajorlar (QR uchun): hall nomi → tartiblangan machine ro'yxati ── */
  const [realByHall, setRealByHall] = useState({});
  const [qrBusy, setQrBusy] = useState(null);

  useEffect(() => {
    api.get('/halls').then(r => {
      const map = {};
      (r.data.data || []).forEach(h => {
        map[h.name] = (h.machines || []).filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name));
      });
      setRealByHall(map);
    }).catch(() => {});
  }, []);

  // Mock trenajor (zal nomi + tartib raqami) → real machine yozuvi
  const realMachineFor = (zalName, idx) => realByHall[zalName]?.[idx] || null;

  // Real machine_id bo'yicha QR'ni PDF qilib yuklab olish
  const downloadQrPdf = async (machine, hallName) => {
    setQrBusy(machine.id);
    try {
      const r = await api.get(`/machine/${machine.id}/qr`);
      const { qr_url, name, serial_number } = r.data.data;
      const dataUrl = await QRCode.toDataURL(qr_url, { width: 800, margin: 1 });
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      doc.setFontSize(24); doc.text('SportUDS', pageW / 2, 28, { align: 'center' });
      doc.setFontSize(18); doc.text(name, pageW / 2, 42, { align: 'center' });
      if (hallName) { doc.setFontSize(12); doc.setTextColor(120); doc.text(hallName, pageW / 2, 51, { align: 'center' }); doc.setTextColor(0); }
      const size = 110, x = (pageW - size) / 2;
      doc.addImage(dataUrl, 'PNG', x, 62, size, size);
      doc.setFontSize(13); doc.text("Mashg'ulotni boshlash uchun ilovada skanerlang", pageW / 2, 62 + size + 14, { align: 'center' });
      if (serial_number) { doc.setFontSize(10); doc.setTextColor(150); doc.text(`SN: ${serial_number}`, pageW / 2, 62 + size + 24, { align: 'center' }); }
      doc.setFontSize(8); doc.setTextColor(180); doc.text(qr_url, pageW / 2, 285, { align: 'center' });
      doc.save(`SportUDS_QR_${name.replace(/\s+/g, '_')}.pdf`);
    } catch {
      message.error('QR yaratishda xato');
    } finally {
      setQrBusy(null);
    }
  };

  /* ══════════════════════════════════════════════════
     REAL DEVICE ↔ TRENAJOR bog'liqligi (1:1 ixtiyoriy)
     device'dan kelgan jonli telemetriya trenajor kartochkasida
  ══════════════════════════════════════════════════ */
  const [allDevices, setAllDevices]   = useState([]);          // barcha device'lar (biriktirilmaganini tanlash uchun)
  const [machineDev, setMachineDev]   = useState({});          // machineId → { device, online } | null | undefined
  const [attachMachine, setAttachMachine] = useState(null);    // biriktirish modali ochiq bo'lgan real trenajor
  const [attachSel, setAttachSel]     = useState(null);        // tanlangan biriktirilmagan device id
  const [devBusy, setDevBusy]         = useState(false);

  const loadAllDevices = useCallback(async () => {
    try { const r = await devicesAPI.getAll(); setAllDevices(r.data.data || []); }
    catch { /* ixtiyoriy */ }
  }, []);

  useEffect(() => { loadAllDevices(); }, [loadAllDevices]);

  // Tanlangan zalning real trenajorlari uchun device + oxirgi telemetriyani yangilaydi.
  const refreshMachineDevices = useCallback(async (zal) => {
    if (!zal) return;
    const machines = realByHall[zal.name] || [];
    const results = await Promise.all(machines.map(async (m) => {
      try {
        const r = await devicesAPI.getByMachine(m.id);
        const data = r.data.data;
        const online = data?.last_seen ? (Date.now() - new Date(data.last_seen).getTime() < 60000) : false;
        return [m.id, data ? { device: data, online } : null];
      } catch { return [m.id, undefined]; }
    }));
    setMachineDev((prev) => { const next = { ...prev }; results.forEach(([id, v]) => { next[id] = v; }); return next; });
  }, [realByHall]);

  // Zal tanlanganda + har 4s da telemetriyani yangilab turamiz (jonli).
  useEffect(() => {
    if (!activeZal) return;
    refreshMachineDevices(activeZal);
    const t = setInterval(() => refreshMachineDevices(activeZal), 4000);
    return () => clearInterval(t);
  }, [activeZal, refreshMachineDevices]);

  const detachDevice = async (deviceId, machineId) => {
    setDevBusy(true);
    try {
      await devicesAPI.assign(deviceId, null);
      message.success('Qurilma uzildi');
      await Promise.all([loadAllDevices(), refreshMachineDevices(activeZal)]);
      setMachineDev((p) => ({ ...p, [machineId]: null }));
    } catch (e) { message.error(e.response?.data?.error || 'Xato'); }
    finally { setDevBusy(false); }
  };

  const confirmAttach = async () => {
    if (!attachSel || !attachMachine) return;
    setDevBusy(true);
    try {
      await devicesAPI.assign(attachSel, attachMachine.id);
      message.success('Qurilma biriktirildi');
      setAttachMachine(null); setAttachSel(null);
      await Promise.all([loadAllDevices(), refreshMachineDevices(activeZal)]);
    } catch (e) { message.error(e.response?.data?.error || 'Xato'); }
    finally { setDevBusy(false); }
  };

  // Yangi device yaratib darhol shu trenajorga biriktiradi.
  const createAndAttach = async () => {
    if (!attachMachine) return;
    setDevBusy(true);
    try {
      const r = await devicesAPI.create({ machine_id: attachMachine.id });
      const c = r.data.credentials;
      Modal.success({
        title: 'Qurilma yaratildi va biriktirildi',
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <div>Bu ma'lumot faqat hozir ko'rsatiladi — qurilmaga yozing:</div>
            <div><b>client_id:</b> <code>{c.mqtt_client_id}</code></div>
            <div><b>parol:</b> <code>{c.mqtt_password}</code></div>
            <div><b>device_uid:</b> <code>{c.device_uid}</code></div>
          </div>
        ),
      });
      setAttachMachine(null); setAttachSel(null);
      await Promise.all([loadAllDevices(), refreshMachineDevices(activeZal)]);
    } catch (e) { message.error(e.response?.data?.error || 'Xato'); }
    finally { setDevBusy(false); }
  };

  const unattachedDevices = allDevices.filter((d) => !d.machine_id);

  const sb       = isDark ? '#0d1424'                : '#ffffff';
  const sbBdr    = isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0';
  const textMain = isDark ? '#e2e8f0' : '#1e293b';
  const textMuted= isDark ? '#94a3b8' : '#64748b';
  const gridBg   = isDark ? '#0a111e'  : '#f0f4f8';
  const cellBg   = isDark ? '#0d1424'  : '#e8edf4';
  const cellBdr  = isDark ? 'rgba(255,255,255,0.07)' : '#d1d9e6';

  const selectZal  = (z) => { setActiveZal(z); setFlyTarget(z); };
  const closeModal = ()  => { setModalOpen(false); setCanvasReady(false); };
  const cols = activeZal ? gridCols(activeZal.trinajorlar.length) : 1;

  return (
    <div style={{ margin: -20, height: 'calc(100vh - 56px)', display: 'flex', overflow: 'hidden' }}>

      {/* ════ XARITA ════ */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapContainer center={[41.3200, 69.2700]} zoom={12} style={{ width: '100%', height: '100%' }} scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {flyTarget && <FlyTo lat={flyTarget.lat} lng={flyTarget.lng} />}
          {ZALLAR.map(z => (
            <Marker
              key={z.id}
              position={[z.lat, z.lng]}
              icon={makeIcon(activeZal?.id === z.id)}
              eventHandlers={{ click: () => selectZal(z) }}
            />
          ))}
        </MapContainer>
      </div>

      {/* ════ SIDEBAR ════ */}
      <div style={{
        width: 300, flexShrink: 0, height: '100%',
        display: 'flex', flexDirection: 'column',
        background: sb, borderLeft: `1px solid ${sbBdr}`, overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${sbBdr}`, flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: textMain }}>Zallar</div>
          <div style={{ fontSize: 12, color: textMuted, marginTop: 1 }}>{ZALLAR.length} ta sport zali</div>
        </div>

        {/* Zallar ro'yxati */}
        <div style={{ flex: activeZal ? '0 0 auto' : 1, overflowY: 'auto' }}>
          {ZALLAR.map(z => {
            const isActive = activeZal?.id === z.id;
            const faol = z.trinajorlar.filter(t => t.status === 'faol').length;
            return (
              <div key={z.id} onClick={() => selectZal(z)} style={{
                padding: '11px 16px', cursor: 'pointer',
                borderBottom: `1px solid ${sbBdr}`,
                borderLeft: `3px solid ${isActive ? MARKER_COLOR : 'transparent'}`,
                background: isActive ? isDark ? 'rgba(99,102,241,0.10)' : 'rgba(99,102,241,0.06)' : 'transparent',
                transition: 'background 0.15s',
                display: 'flex', alignItems: 'center', gap: 11,
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: isActive ? MARKER_COLOR+'22' : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                  border: `1.5px solid ${isActive ? MARKER_COLOR+'55' : sbBdr}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 800, color: isActive ? MARKER_COLOR : textMuted,
                }}>{z.id}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? textMain : textMuted,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.name}</div>
                  <div style={{ fontSize: 11, color: textMuted, marginTop: 1 }}>
                    {z.trinajorlar.length} trinajor ·{' '}
                    <span style={{ color: '#22c55e' }}>{faol} faol</span>
                  </div>
                </div>
                <span style={{ fontSize: 14, color: isActive ? MARKER_COLOR : textMuted, opacity: isActive ? 1 : 0.35 }}>›</span>
              </div>
            );
          })}
        </div>

        {/* Tanlangan zal */}
        {activeZal && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderTop: `1px solid ${sbBdr}`, overflow: 'hidden' }}>
            {/* Zal info */}
            <div style={{ padding: '12px 16px 10px', flexShrink: 0, borderBottom: `1px solid ${sbBdr}` }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: textMain }}>{activeZal.name}</div>
              <div style={{ fontSize: 11, color: textMuted, marginTop: 2 }}>{activeZal.address}</div>
              <div style={{ fontSize: 11, color: textMuted }}>{activeZal.phone}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 7, marginTop: 10 }}>
                {[
                  { label: 'Jami', value: activeZal.trinajorlar.length, c: MARKER_COLOR },
                  { label: 'Faol', value: activeZal.trinajorlar.filter(t=>t.status==='faol').length, c: '#22c55e' },
                  { label: 'Texnik', value: activeZal.trinajorlar.filter(t=>t.status==='texnik').length, c: '#f59e0b' },
                ].map((s,i) => (
                  <div key={i} style={{ background: isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)',
                    border:`1px solid ${sbBdr}`, borderRadius:8, padding:'7px 8px', textAlign:'center' }}>
                    <div style={{ fontSize:17, fontWeight:800, color:s.c }}>{s.value}</div>
                    <div style={{ fontSize:10, color:textMuted }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trinajorlar + live ma'lumot */}
            <div style={{ flex:1, overflowY:'auto', padding:'10px 12px' }}>
              <div style={{ fontSize:10, fontWeight:600, color:textMuted, textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
                Trinajorlar holati
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {activeZal.trinajorlar.map((t, ti) => {
                  const key = `${activeZal.id}-${t.id}`;
                  const ld  = live[key];
                  const athlete = t.athleteId ? ATHLETES.find(a=>a.id===t.athleteId) : null;
                  const isFaol  = t.status === 'faol';
                  const real    = realMachineFor(activeZal.name, ti);
                  const md      = real ? machineDev[real.id] : undefined;
                  return (
                    <div key={t.id} style={{
                      background: isDark?'rgba(255,255,255,0.03)':'rgba(0,0,0,0.02)',
                      border:`1px solid ${isFaol ? '#22c55e33' : sbBdr}`,
                      borderRadius:10, padding:'9px 11px',
                      borderLeft: `3px solid ${isFaol ? '#22c55e' : '#f59e0b'}`,
                    }}>
                      {/* Trinajor nomi + holat */}
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: isFaol ? 7 : 0 }}>
                        <div style={{
                          width:22, height:22, borderRadius:6, flexShrink:0,
                          background: MARKER_COLOR+'18', border:`1px solid ${MARKER_COLOR}30`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:9, fontWeight:700, color:MARKER_COLOR,
                        }}>#{t.id}</div>
                        <span style={{ fontSize:12, fontWeight:600, color:textMain, flex:1 }}>{t.name}</span>
                        <span style={{
                          fontSize:9, fontWeight:600, padding:'2px 7px', borderRadius:20,
                          background: isFaol?'#22c55e20':'#f59e0b20',
                          color: isFaol?'#22c55e':'#f59e0b',
                          border:`1px solid ${isFaol?'#22c55e40':'#f59e0b40'}`,
                        }}>{isFaol ? '● Faol' : '⚙ Texnik'}</span>
                      </div>

                      {/* Sportchi va live ko'rsatkichlar */}
                      {isFaol && athlete && ld && (
                        <>
                          {/* Sportchi */}
                          <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:6,
                            background: isDark?'rgba(99,102,241,0.08)':'rgba(99,102,241,0.05)',
                            borderRadius:7, padding:'5px 8px' }}>
                            <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0,
                              background:`linear-gradient(135deg,${MARKER_COLOR},#8b5cf6)`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:10, fontWeight:700, color:'#fff' }}>
                              {athlete.name[0]}
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:11, fontWeight:700, color:textMain,
                                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                {athlete.name}
                              </div>
                              <div style={{ fontSize:10, color:textMuted }}>{athlete.sport} · {athlete.weight} kg</div>
                            </div>
                            <div style={{ fontSize:10, color:textMuted, fontVariantNumeric:'tabular-nums' }}>
                              {fmtTime(ld.elapsed)}
                            </div>
                          </div>

                          {/* Live UDS natijalar */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:4 }}>
                            {[
                              { label:'Balandlik', value:`${ld.barCm.toFixed(0)} sm`, c:'#38bdf8' },
                              { label:'Fmax',  value:`${(ld.Fmax/9.81).toFixed(1)} kg`, c:'#f87171' },
                              { label:'Vmax',  value:`${ld.Vmax} m/s`,  c:'#fb923c' },
                              { label:'Nmax',  value:`${ld.Nmax} W`,    c:'#a78bfa' },
                              { label:'Q',     value:ld.Q,              c:'#34d399' },
                              { label:'Urinish', value:ld.attempts,     c:textMuted },
                            ].map((m,i)=>(
                              <div key={i} style={{ background:isDark?'rgba(255,255,255,0.04)':'rgba(0,0,0,0.03)',
                                borderRadius:6, padding:'4px 6px', textAlign:'center' }}>
                                <div style={{ fontSize:11, fontWeight:700, color:m.c, fontVariantNumeric:'tabular-nums' }}>{m.value}</div>
                                <div style={{ fontSize:9, color:textMuted }}>{m.label}</div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {t.status === 'texnik' && (
                        <div style={{ fontSize:11, color:'#f59e0b', marginTop:4 }}>
                          ⚙ Texnik xizmat ko'rsatilmoqda
                        </div>
                      )}

                      {/* QR kod (PDF) — real trenajorga bog'langan */}
                      {real && (
                        <button
                          onClick={() => downloadQrPdf(real, activeZal.name)}
                          disabled={qrBusy === real.id}
                          style={{
                            marginTop: 8, width: '100%', padding: '7px 0', borderRadius: 8,
                            cursor: qrBusy === real.id ? 'default' : 'pointer',
                            border: `1px solid ${MARKER_COLOR}55`,
                            background: isDark ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.08)',
                            color: MARKER_COLOR, fontWeight: 700, fontSize: 11,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          }}>
                          {qrBusy === real.id ? 'Tayyorlanmoqda…' : '⬛ QR kod (PDF)'}
                        </button>
                      )}

                      {/* ── Real device (qurilma) paneli + jonli telemetriya ── */}
                      {real && (
                        <div style={{
                          marginTop: 8, padding: '8px 10px', borderRadius: 8,
                          border: `1px solid ${sbBdr}`,
                          background: isDark ? 'rgba(56,189,248,0.06)' : 'rgba(56,189,248,0.05)',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: (md && md.device) ? 6 : 0 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: textMuted, textTransform: 'uppercase', letterSpacing: 0.5, flex: 1 }}>
                              📡 Qurilma
                            </span>
                            {md === undefined && <span style={{ fontSize: 10, color: textMuted }}>…</span>}
                            {md && md.device && (
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                                background: md.online ? '#22c55e20' : '#64748b20',
                                color: md.online ? '#22c55e' : '#94a3b8',
                              }}>{md.online ? '● onlayn' : '○ oflayn'}</span>
                            )}
                          </div>

                          {md && md.device ? (
                            <>
                              <div style={{ fontSize: 11, fontFamily: 'monospace', color: textMain, marginBottom: 5 }}>
                                {md.device.mqtt_client_id}
                              </div>
                              {md.device.latest ? (
                                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 7 }}>
                                  {md.device.latest.bar_cm != null && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#38bdf8', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderRadius: 6, padding: '2px 6px' }}>bar {md.device.latest.bar_cm} sm</span>
                                  )}
                                  {md.device.latest.weight_kg != null && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderRadius: 6, padding: '2px 6px' }}>{md.device.latest.weight_kg} kg</span>
                                  )}
                                  {md.device.latest.reps != null && (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#34d399', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)', borderRadius: 6, padding: '2px 6px' }}>{md.device.latest.reps} takror</span>
                                  )}
                                </div>
                              ) : (
                                <div style={{ fontSize: 10, color: textMuted, marginBottom: 7 }}>telemetriya hali yo'q</div>
                              )}
                              <button
                                onClick={() => detachDevice(md.device.id, real.id)}
                                disabled={devBusy}
                                style={{
                                  width: '100%', padding: '5px 0', borderRadius: 7, cursor: 'pointer',
                                  border: `1px solid ${isDark ? 'rgba(248,113,113,0.4)' : '#fca5a5'}`,
                                  background: 'transparent', color: '#f87171', fontWeight: 600, fontSize: 10,
                                }}>Uzish</button>
                            </>
                          ) : md === null ? (
                            <button
                              onClick={() => { setAttachMachine(real); setAttachSel(null); }}
                              style={{
                                width: '100%', padding: '6px 0', borderRadius: 7, cursor: 'pointer',
                                border: `1px dashed ${isDark ? 'rgba(56,189,248,0.45)' : '#7dd3fc'}`,
                                background: 'transparent', color: '#38bdf8', fontWeight: 600, fontSize: 11,
                              }}>+ Qurilma biriktirish</button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3D tugma */}
            <div style={{ padding:'10px 14px 14px', flexShrink:0 }}>
              <button onClick={() => setModalOpen(true)} style={{
                width:'100%', padding:'10px 0', border:'none', borderRadius:10, cursor:'pointer',
                background:`linear-gradient(135deg,${MARKER_COLOR},#8b5cf6)`,
                color:'#fff', fontWeight:700, fontSize:13,
                boxShadow:'0 4px 16px rgba(99,102,241,0.35)', transition:'opacity 0.15s',
              }}
              onMouseEnter={e=>e.currentTarget.style.opacity='.85'}
              onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                Trinajorlarni 3D ko'rish →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ 3D GRID MODAL ════ */}
      <Modal
        open={modalOpen} onCancel={closeModal}
        footer={null} title={null} closeIcon={null}
        width="96vw" centered destroyOnClose
        afterOpenChange={(open) => { if (open) setCanvasReady(true); }}
        styles={{
          body:    { padding:0, margin:0, lineHeight:0 },
          content: { padding:0, margin:0, borderRadius:16, overflow:'hidden', background:gridBg },
        }}
      >
        {activeZal && (
          <div style={{ width:'100%', height:'92vh', display:'flex', flexDirection:'column', background:gridBg }}>

            {/* Modal header */}
            <div style={{
              height:52, flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'space-between',
              padding:'0 18px', borderBottom:`1px solid ${sbBdr}`,
              background: isDark?'rgba(13,20,36,0.98)':'rgba(255,255,255,0.98)',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:28, height:28, borderRadius:8,
                  background:MARKER_COLOR+'22', border:`1.5px solid ${MARKER_COLOR}55`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:13, fontWeight:800, color:MARKER_COLOR }}>{activeZal.id}</div>
                <span style={{ fontWeight:700, fontSize:15, color:textMain }}>{activeZal.name}</span>
                <span style={{ fontSize:13, color:textMuted }}>· {activeZal.trinajorlar.length} ta trinajor</span>
              </div>
              <button onClick={closeModal} style={{
                width:32, height:32, borderRadius:9, border:'none', cursor:'pointer',
                background: isDark?'rgba(255,255,255,0.08)':'rgba(0,0,0,0.06)',
                color:textMuted, fontSize:16,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>✕</button>
            </div>

            {/* Grid */}
            <div style={{
              flex:1, display:'grid',
              gridTemplateColumns:`repeat(${cols},1fr)`,
              gap:10, padding:10, overflow:'hidden',
            }}>
              {activeZal.trinajorlar.map((t, ti) => {
                const key     = `${activeZal.id}-${t.id}`;
                const ld      = live[key];
                const athlete = t.athleteId ? ATHLETES.find(a=>a.id===t.athleteId) : null;
                const isFaol  = t.status === 'faol';
                // Real device telemetriyasi (trenajorga biriktirilgan qurilmadan kelgan oxirgi o'lchov)
                const realM   = realMachineFor(activeZal.name, ti);
                const lt      = realM ? machineDev[realM.id]?.device?.latest : null;
                const hasReal = !!(lt && lt.bar_cm != null);
                // 3D shtanga balandligi: real device bo'lsa — UNDAN (jonli), aks holda mock simulyatsiya.
                const barCm   = hasReal ? Number(lt.bar_cm) : (ld?.barCm ?? t.barCm);

                const panelBg  = isDark ? 'rgba(5,10,20,0.92)' : 'rgba(248,250,252,0.97)';
                const rowHover = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.025)';
                const divCol   = isDark ? 'rgba(255,255,255,0.07)' : '#e2e8f0';

                const metrics = isFaol && ld ? [
                  { label: hasReal ? 'Balandlik (jonli)' : 'Balandlik', value:`${barCm.toFixed(0)} sm`, color:'#38bdf8' },
                  { label:'Fmax',      value:`${(ld.Fmax/9.81).toFixed(1)} kg`,   color:'#f87171' },
                  { label:'P₀',        value:`${ld.P0} J`,                        color:'#fb923c' },
                  { label:'Vmax',      value:`${ld.Vmax} m/s`,                    color:'#a78bfa' },
                  { label:'Nmax',      value:`${ld.Nmax} W`,                      color:'#f472b6' },
                  { label:'Q',         value:String(ld.Q),                        color:'#34d399' },
                  { label:'Urinish',   value:String(ld.attempts),                 color:'#fb923c' },
                  { label:'Vaqt',      value:fmtTime(ld.elapsed),                 color:'#22c55e' },
                ] : [];

                return (
                  <div key={t.id} style={{
                    display:'flex', flexDirection:'row',
                    background:cellBg,
                    border:`1px solid ${isFaol?'#22c55e28':cellBdr}`,
                    borderRadius:12, overflow:'hidden', minHeight:0,
                    boxShadow: isDark
                      ? '0 6px 24px rgba(0,0,0,0.55)'
                      : '0 6px 24px rgba(0,0,0,0.12)',
                  }}>

                    {/* ── Chap panel (table) ── */}
                    <div style={{
                      width:196, flexShrink:0,
                      display:'flex', flexDirection:'column',
                      background:panelBg,
                      borderRight:`1px solid ${divCol}`,
                      overflow:'hidden',
                    }}>
                      {/* Trinajor header */}
                      <div style={{
                        padding:'10px 12px',
                        borderBottom:`1px solid ${divCol}`,
                        display:'flex', alignItems:'center', gap:7,
                      }}>
                        <div style={{
                          width:22, height:22, borderRadius:6, flexShrink:0,
                          background:MARKER_COLOR+'20', border:`1px solid ${MARKER_COLOR}40`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:9, fontWeight:800, color:MARKER_COLOR,
                        }}>#{t.id}</div>
                        <span style={{
                          fontSize:12, fontWeight:700, color:textMain, flex:1, minWidth:0,
                          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                        }}>{t.name}</span>
                        <span style={{
                          fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:20, flexShrink:0,
                          background:isFaol?'#22c55e20':'#f59e0b20',
                          color:isFaol?'#22c55e':'#f59e0b',
                          border:`1px solid ${isFaol?'#22c55e40':'#f59e0b40'}`,
                        }}>{isFaol?'Faol':'Texnik'}</span>
                        {hasReal && (
                          <span style={{
                            fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:20, flexShrink:0,
                            background:'#38bdf820', color:'#38bdf8', border:'1px solid #38bdf840',
                          }}>📡 jonli</span>
                        )}
                      </div>

                      {isFaol && athlete ? (
                        <>
                          {/* Sportchi */}
                          <div style={{ padding:'9px 12px', borderBottom:`1px solid ${divCol}`, display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                            <div style={{
                              width:30, height:30, borderRadius:'50%', flexShrink:0,
                              background:`linear-gradient(135deg,${MARKER_COLOR},#8b5cf6)`,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              fontSize:12, fontWeight:700, color:'#fff',
                            }}>{athlete.name[0]}</div>
                            <div style={{ minWidth:0, flex:1, display:'flex', flexDirection:'column', gap:3 }}>
                              <div style={{
                                fontSize:12, fontWeight:700, color:textMain,
                                display:'-webkit-box', WebkitLineClamp:2,
                                WebkitBoxOrient:'vertical', overflow:'hidden',
                                lineHeight:1.35,
                              }}>
                                {athlete.name}
                              </div>
                              <div style={{ fontSize:11, color:textMuted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                {athlete.sport}
                              </div>
                              <div style={{ fontSize:11, color:textMuted, whiteSpace:'nowrap' }}>
                                {athlete.weight} kg · {athlete.age} yosh
                              </div>
                            </div>
                          </div>

                          {/* UDS jadval */}
                          <div style={{ flex:1, overflowY:'auto' }}>
                            {metrics.map((m, i) => (
                              <div key={i} style={{
                                display:'flex', alignItems:'center',
                                padding:'10px 12px',
                                borderBottom: i < metrics.length-1 ? `1px solid ${divCol}` : 'none',
                                background: i%2===0 ? 'transparent' : rowHover,
                              }}>
                                <span style={{ fontSize:11, color:textMuted, flex:1, whiteSpace:'nowrap' }}>{m.label}</span>
                                <span style={{ fontSize:12, fontWeight:700, color:m.color,
                                  fontVariantNumeric:'tabular-nums', whiteSpace:'nowrap' }}>{m.value}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        /* Texnik holat */
                        <div style={{ flex:1, display:'flex', flexDirection:'column',
                          alignItems:'center', justifyContent:'center', gap:22, padding:16 }}>
                          <div style={{ fontSize:28 }}>⚙</div>
                          <div style={{ fontSize:12, fontWeight:600, color:'#f59e0b', textAlign:'center' }}>
                            Texnik xizmat
                          </div>
                          <div style={{ fontSize:11, color:textMuted, textAlign:'center' }}>
                            Trinajor vaqtincha ishlamayapti
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── O'ng: 3D Canvas ── */}
                    <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
                      {canvasReady && <TrinajorCanvas isDark={isDark} barCm={barCm} />}
                      <div style={{
                        position:'absolute', bottom:8, right:10, zIndex:5,
                        fontSize:10, color:isDark?'#1e3550':'#b0bec5', pointerEvents:'none',
                      }}>↻ aylantiring</div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* ════ QURILMA BIRIKTIRISH MODALI ════ */}
      <Modal
        title={`Qurilma biriktirish — ${attachMachine?.name || ''}`}
        open={!!attachMachine}
        onCancel={() => { setAttachMachine(null); setAttachSel(null); }}
        footer={[
          <Button key="new" onClick={createAndAttach} loading={devBusy}>
            Yangi yaratib biriktirish
          </Button>,
          <Button key="ok" type="primary" onClick={confirmAttach} loading={devBusy} disabled={!attachSel}>
            Biriktirish
          </Button>,
        ]}
        width={480}
      >
        <div style={{ fontSize: 13, marginBottom: 12 }}>
          Biriktirilmagan qurilmani tanlang yoki shu trenajor uchun yangisini yarating:
        </div>
        {unattachedDevices.length ? (
          <Select
            style={{ width: '100%' }}
            placeholder="Biriktirilmagan qurilma"
            value={attachSel}
            onChange={setAttachSel}
            options={unattachedDevices.map((d) => ({
              value: d.id,
              label: `${d.mqtt_client_id} (uid ${d.device_uid})`,
            }))}
          />
        ) : (
          <Empty description="Biriktirilmagan qurilma yo'q — yangisini yarating" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        )}
      </Modal>
    </div>
  );
}
