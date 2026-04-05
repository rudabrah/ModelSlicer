import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import { sliceModel } from './utils/slicer';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    this.setState({ errorInfo });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, color: '#ff4444', backgroundColor: '#1a1a1a', height: '100vh', boxSizing: 'border-box' }}>
          <h2>System Crash!</h2>
          <p>{this.state.error?.toString()}</p>
          <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: '500px', backgroundColor: '#000', padding: 20 }}>
            {this.state.errorInfo?.componentStack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', marginTop: 20 }}>Reload App</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function DownloadButton({ part }) {
  const handleDownload = () => {
    // Generate a temporary mesh to apply the correct position/rotation for export
    const mesh = new THREE.Mesh(part.geometry);
    mesh.position.fromArray(part.position);
    mesh.quaternion.fromArray(part.quaternion);
    mesh.scale.fromArray(part.scale);
    mesh.updateMatrixWorld(true);

    const exporter = new STLExporter();
    const stlData = exporter.parse(mesh);
    const blob = new Blob([stlData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = `${part.name}.stl`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button 
      onClick={handleDownload}
      style={{ marginLeft: 8, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
    >
      Last ned
    </button>
  );
}

const sideColors = {
  top: "#ff3366",    // Rød/Pink
  bottom: "#33ccff", // Turiks/Blå
  left: "#ffcc00",   // Gul
  right: "#66ff66"   // Grønn
};

function Scene({ parts, activePartId, mode, orbitEnabled, setOrbitEnabled, boxRef, controlTarget, partRefs, edgePoints, activePointId, setActivePointId, setEdgePoints }) {
  const { scene } = useThree();
  const pointRefs = useRef({});
  const planes = useMemo(() => Array.from({length: 6}, () => new THREE.Plane()), []);

  // Update highlighting planes to roughly encompass the tool
  useFrame(() => {
    if (boxRef.current && parts.length > 0) {
      boxRef.current.updateMatrixWorld();
      const m = boxRef.current.matrixWorld;
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(m);
      
      const faceData = [
         { n: [-1, 0, 0], p: [0.5, 0, 0] },
         { n: [1, 0, 0], p: [-0.5, 0, 0] },
         { n: [0, -1, 0], p: [0, 0.5, 0] },
         { n: [0, 1, 0], p: [0, -0.5, 0] },
         { n: [0, 0, -1], p: [0, 0, 0.5] },
         { n: [0, 0, 1], p: [0, 0, -0.5] }
      ];
      
      faceData.forEach((fd, i) => {
          const normal = new THREE.Vector3(...fd.n).applyMatrix3(normalMatrix).normalize();
          const point = new THREE.Vector3(...fd.p).applyMatrix4(m);
          planes[i].setFromNormalAndCoplanarPoint(normal, point);
      });
    }
  });

// Compute the ordered points for both the line path and the shape
  const orderedVertices = useMemo(() => {
     const pts = [];
     pts.push(new THREE.Vector2(-0.5, 0.5)); // Top-Left
     
     const top = [...edgePoints.top].sort((a,b) => a.x - b.x);
     top.forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
     
     pts.push(new THREE.Vector2(0.5, 0.5)); // Top-Right
     
     const right = [...edgePoints.right].sort((a,b) => b.y - a.y);
     right.forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
     
     pts.push(new THREE.Vector2(0.5, -0.5)); // Bottom-Right
     
     const bottom = [...edgePoints.bottom].sort((a,b) => b.x - a.x);
     bottom.forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
     
     pts.push(new THREE.Vector2(-0.5, -0.5)); // Bottom-Left
     
     const left = [...edgePoints.left].sort((a,b) => a.y - b.y);
     left.forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));

     return pts;
  }, [edgePoints]);

  const lineGeometry = useMemo(() => {
     const points3D = orderedVertices.map(v => new THREE.Vector3(v.x, v.y, 0));
     return new THREE.BufferGeometry().setFromPoints(points3D);
  }, [orderedVertices]);

  // Construct ExtrudeGeometry dynamically from edgePoints
  const extrudeGeometry = useMemo(() => {
     const shape = new THREE.Shape(orderedVertices);
     const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 1,
        bevelEnabled: false,
     });
     // Center the depth from Z=0 to Z=-0.5
     geo.translate(0, 0, -0.5);
     return geo;
  }, [orderedVertices]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <axesHelper args={[100]} />
      <Grid infiniteGrid fadeDistance={500} sectionColor="#444" cellColor="#222" />

      <OrbitControls makeDefault enabled={orbitEnabled} />

      {parts.filter(p => p.visible).map((part) => (
        <group 
           key={part.id}
           ref={(el) => { if (el) partRefs.current[part.id] = el; }}
           position={part.position}
           quaternion={part.quaternion}
           scale={part.scale}
        >
           <mesh geometry={part.geometry}>
             <meshStandardMaterial 
               color={part.id === activePartId ? "#886600" : "#aaaaaa"} 
               roughness={0.4} 
               metalness={0.1} 
               side={THREE.DoubleSide} 
             />
           </mesh>

           {part.id === activePartId && (
              <mesh geometry={part.geometry}>
                  <meshStandardMaterial 
                     color="#00ffff" 
                     emissive="#00ffff"
                     emissiveIntensity={0.2}
                     transparent={true}
                     opacity={0.8}
                     side={THREE.DoubleSide} 
                     clippingPlanes={planes}
                     clipIntersection={true} 
                  />
              </mesh>
           )}
        </group>
      ))}

      {/* The Cutting Box (Custom Tool Volume) */}
      {parts.length > 0 && activePartId && (
        <group position={[0,0,0]} scale={[25, 25, 25]}>
          <mesh ref={(el) => { if (el) boxRef.current = el; }} geometry={extrudeGeometry}>
             {controlTarget === 'boks' ? (
               <meshBasicMaterial color="#ff0000" transparent opacity={0.15} depthWrite={false} side={THREE.DoubleSide} />
             ) : controlTarget === 'shape' ? (
               <meshBasicMaterial color="#00ffff" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
             ) : (
               <meshBasicMaterial color="#ff0000" wireframe transparent opacity={0.1} depthWrite={false} /> 
             )}
          </mesh>

          {/* Tegn en veldig tydelig linje/profil av kuttet på framsiden */}
          {controlTarget === 'shape' && (
             <mesh position={[0, 0, 0.5]}>
                <lineLoop geometry={lineGeometry}>
                   <lineBasicMaterial color="#ffffff" linewidth={2} depthTest={false} transparent opacity={0.8} />
                </lineLoop>
             </mesh>
          )}

          {/* Render Points for Shape Editing */}
          {controlTarget === 'shape' && Object.entries(edgePoints).map(([side, points]) => (
             points.map(p => (
                 <mesh 
                   key={p.id} 
                   position={[p.x, p.y, 0.5]}
                   ref={el => { if (el) pointRefs.current[p.id] = el; }}
                   onClick={(e) => { e.stopPropagation(); setActivePointId({ id: p.id, side }); }}
                 >
                   <sphereGeometry args={[0.02, 16, 16]} />
                   <meshBasicMaterial color={activePointId?.id === p.id ? "#ffffff" : sideColors[side]} depthTest={false} />
                 </mesh>
             ))
          ))}
          
          {/* Boundary Reference Line to visualize the standard Box outline */}
          {controlTarget === 'shape' && (
             <mesh position={[0, 0, 0]}>
                 <boxGeometry args={[1, 1, 1]} />
                 <meshBasicMaterial wireframe transparent opacity={0.05} color="#ffffff" />
             </mesh>
          )}
        </group>
      )}

      {/* Box Control */}
      {parts.length > 0 && activePartId && controlTarget === 'boks' && boxRef.current && (
        <TransformControls
          object={boxRef.current}
          mode={mode}
          onMouseDown={() => setOrbitEnabled(false)}
          onMouseUp={() => setOrbitEnabled(true)}
        />
      )}

      {/* Part Control */}
      {parts.length > 0 && activePartId && controlTarget === 'part' && partRefs.current[activePartId] && (
        <TransformControls
          object={partRefs.current[activePartId]}
          mode={mode}
          onMouseDown={() => setOrbitEnabled(false)}
          onMouseUp={() => setOrbitEnabled(true)}
        />
      )}

      {/* Shape Point Control */}
      {parts.length > 0 && activePartId && controlTarget === 'shape' && activePointId && pointRefs.current[activePointId.id] && (
        <TransformControls
          object={pointRefs.current[activePointId.id]}
          mode="translate"
          onMouseDown={() => setOrbitEnabled(false)}
          onMouseUp={() => {
              setOrbitEnabled(true);
              const targetObj = pointRefs.current[activePointId.id];
              if (!targetObj) return;
              const pos = targetObj.position;
              setEdgePoints(prev => {
                  const side = activePointId.side;
                  const newPoints = [...prev[side]].map(p => {
                      if (p.id === activePointId.id) {
                          return { ...p, x: pos.x, y: pos.y };
                      }
                      return p;
                  });
                  return { ...prev, [side]: newPoints };
              });
          }}
          onChange={() => {}}
        />
      )}
    </>
  );
}

function App() {
  const [parts, setParts] = useState([]);
  const [activePartId, setActivePartId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [mode, setMode] = useState('translate'); 
  const [orbitEnabled, setOrbitEnabled] = useState(true);
  const [controlTarget, setControlTarget] = useState('boks'); // 'boks' | 'part' | 'shape'

  const boxRef = useRef();
  const partRefs = useRef({});

  const [edgePoints, setEdgePoints] = useState({
     top: [],
     bottom: [],
     left: [],
     right: []
  });
  const [activePointId, setActivePointId] = useState(null);

  const addPoint = (side) => {
      setEdgePoints(prev => {
         const newPoints = [...prev[side]];
         let x = 0, y = 0;
         if (side === 'top') { x = 0; y = 0.5; }
         if (side === 'bottom') { x = 0; y = -0.5; }
         if (side === 'left') { x = -0.5; y = 0; }
         if (side === 'right') { x = 0.5; y = 0; }
         
         // Legg til med et lite offsett så de ikke ligger oppå hverandre hvis man spam-klikker
         const offset = (newPoints.length * 0.05);
         if (side === 'top' || side === 'bottom') x += offset;
         if (side === 'left' || side === 'right') y += offset;

         newPoints.push({ id: `p${Date.now()}`, x, y });
         return { ...prev, [side]: newPoints };
      });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (parts.length === 0 || processing) return;
      if (e.key.toLowerCase() === 'w') setMode('translate');
      if (e.key.toLowerCase() === 'e') setMode('rotate');
      if (e.key.toLowerCase() === 'r') setMode('scale');
      if (e.key.toLowerCase() === 't') {
          setControlTarget(prev => {
              if (prev === 'boks') return 'part';
              if (prev === 'part') return 'shape';
              return 'boks';
          });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [parts, processing]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, []);
  const handleDragOver = useCallback((e) => { e.preventDefault(); }, []);

  const loadFile = (file) => {
    setLoading(true);
    setErrorMsg(null);
    const reader = new FileReader();

    reader.onload = (e) => {
      const contents = e.target.result;
      let geometry = null;
      try {
        if (file.name.toLowerCase().endsWith('.stl')) {
          const loader = new STLLoader();
          geometry = loader.parse(contents);
          geometry.computeVertexNormals();
          geometry.center();
        } else if (file.name.toLowerCase().endsWith('.3mf')) {
          const loader = new ThreeMFLoader();
          const object = loader.parse(contents);
          let foundMesh = null;
          object.traverse((child) => {
            if (child.isMesh && !foundMesh) foundMesh = child.geometry;
          });
          if (foundMesh) {
              geometry = foundMesh;
              geometry.computeVertexNormals();
              geometry.center();
          }
        }
        
        if (geometry) {
            const newPart = {
              id: Date.now().toString(),
              name: file.name.replace(/\.[^/.]+$/, ""),
              geometry: geometry,
              visible: true,
              position: [0, 0, 0],
              quaternion: [0, 0, 0, 1],
              scale: [1, 1, 1]
            };
            setParts(prev => [...prev, newPart]);
            setActivePartId(newPart.id);
            setControlTarget('boks');
            setEdgePoints({ top: [], bottom: [], left: [], right: [] });
            setActivePointId(null);
        } else {
            setErrorMsg("Kunne ikke lese geometri fra filen.");
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("Feil under lasting: " + err.message);
      }
      setLoading(false);
    };

    if (file.name.toLowerCase().endsWith('.stl') || file.name.toLowerCase().endsWith('.3mf')) {
      reader.readAsArrayBuffer(file);
    } else {
        setErrorMsg("Støtter kun .stl og .3mf");
        setLoading(false);
    }
  };

  const toggleVisibility = (partId) => {
    setParts(prev => prev.map(p => p.id === partId ? { ...p, visible: !p.visible } : p));
  };
  const deletePart = (partId) => {
    setParts(prev => prev.filter(p => p.id !== partId));
    if (activePartId === partId) setActivePartId(null);
  };

  const handleCut = () => {
    if (!activePartId || !boxRef.current) return;
    
    setProcessing(true);
    setErrorMsg(null);
    const targetPart = parts.find(p => p.id === activePartId);

    setTimeout(async () => {
      try {
        const activeMesh = partRefs.current[activePartId];
        activeMesh.updateMatrixWorld(true);
        boxRef.current.updateMatrixWorld(true);

        const toolGeometry = boxRef.current.geometry.clone();
        
        const { partA, partB } = await sliceModel(targetPart.geometry, toolGeometry, boxRef.current.matrixWorld, activeMesh.matrixWorld);
        
        const partPos = activeMesh.position.toArray();
        const partQuat = activeMesh.quaternion.toArray();
        const partScale = activeMesh.scale.toArray();

        const id1 = Date.now().toString() + "_a";
        const id2 = Date.now().toString() + "_b";
        
        const newPartA = {
          id: id1,
          name: `${targetPart.name}_utside`,
          geometry: partA,
          visible: true,
          position: partPos,
          quaternion: partQuat,
          scale: partScale
        };
        const newPartB = {
          id: id2,
          name: `${targetPart.name}_innside`,
          geometry: partB,
          visible: true,
          position: partPos,
          quaternion: partQuat,
          scale: partScale
        };

        setParts(prev => {
          const filtered = prev.filter(item => item.id !== activePartId);
          return [...filtered, newPartA, newPartB];
        });
        
        setActivePartId(newPartA.id);
        setControlTarget('part'); 
      } catch(err) {
        console.error("Feil ved kutting:", err);
        setErrorMsg("Feil under kutting: " + String(err) + "\n\nStack:\n" + (err.stack || "Ingen"));
      }
      setProcessing(false);
    }, 100);
  };

  return (
    <ErrorBoundary>
      <div 
        style={{ width: '100vw', height: '100vh', position: 'relative', backgroundColor: '#1a1a1a', color: 'white', overflow: 'hidden' }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
      <Canvas camera={{ position: [50, 50, 100], fov: 45 }} gl={{ localClippingEnabled: true }}>
        <Scene 
          parts={parts}
          activePartId={activePartId}
          mode={mode}
          orbitEnabled={orbitEnabled}
          setOrbitEnabled={setOrbitEnabled}
          boxRef={boxRef}
          controlTarget={controlTarget}
          partRefs={partRefs}
          edgePoints={edgePoints}
          activePointId={activePointId}
          setActivePointId={setActivePointId}
          setEdgePoints={setEdgePoints}
        />
      </Canvas>

      <div style={{ position: 'absolute', top: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', padding: '15px', borderRadius: 8, pointerEvents: 'none' }}>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '1.2rem' }}>ModelSlicer</h1>
        {parts.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.8 }}>Dra og slipp en .STL eller .3MF fil her</p>
        ) : (
          <div>
            <p style={{ margin: '5px 0', fontSize: '0.9rem', color: mode === 'translate' ? '#ffcc00' : 'white' }}>[W] Flytt</p>
            <p style={{ margin: '5px 0', fontSize: '0.9rem', color: mode === 'rotate' ? '#ffcc00' : 'white' }}>[E] Roter</p>
            <p style={{ margin: '5px 0', fontSize: '0.9rem', color: mode === 'scale' ? '#ffcc00' : 'white' }}>[R] Skaler</p>
            <p style={{ margin: '15px 0 5px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#00ff66' }}>
              [T] Verktøy: {controlTarget === 'boks' ? 'Styrer Kutteboks' : controlTarget === 'part' ? 'Flytter Modell' : 'Tegn Snitt'}
            </p>
            {controlTarget === 'shape' && (
               <div style={{ marginTop: 15, padding: 10, border: '1px solid #00ffff', pointerEvents: 'auto', backgroundColor: 'rgba(0,0,0,0.8)' }}>
                  <p style={{ margin: '0 0 10px 0', color: '#00ffff' }}>Legg til punkt på vegg:</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                    <button onClick={() => addPoint('top')} style={{ padding: '6px', cursor: 'pointer', backgroundColor: '#008888', color: 'white', borderLeft: `4px solid ${sideColors.top}` }}>+ Topp</button>
                    <button onClick={() => addPoint('bottom')} style={{ padding: '6px', cursor: 'pointer', backgroundColor: '#008888', color: 'white', borderLeft: `4px solid ${sideColors.bottom}` }}>+ Bunn</button>
                    <button onClick={() => addPoint('left')} style={{ padding: '6px', cursor: 'pointer', backgroundColor: '#008888', color: 'white', borderLeft: `4px solid ${sideColors.left}` }}>+ Venstre</button>
                    <button onClick={() => addPoint('right')} style={{ padding: '6px', cursor: 'pointer', backgroundColor: '#008888', color: 'white', borderLeft: `4px solid ${sideColors.right}` }}>+ Høyre</button>
                  </div>
               </div>
            )}
          </div>
        )}
      </div>

      {parts.length > 0 && (
        <div style={{ position: 'absolute', top: 20, right: 20, width: '250px', backgroundColor: 'rgba(0,0,0,0.8)', padding: '15px', borderRadius: 8 }}>
          <h2 style={{ margin: '0 0 10px 0', fontSize: '1rem', borderBottom: '1px solid #555', paddingBottom: '5px' }}>Deler ({parts.length})</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '400px', overflowY: 'auto' }}>
            {parts.map(part => (
              <li 
                key={part.id} 
                style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px', 
                  backgroundColor: activePartId === part.id ? '#333' : 'transparent',
                  borderLeft: activePartId === part.id ? '3px solid #ffcc00' : '3px solid transparent',
                  marginBottom: '5px',
                  cursor: 'pointer'
                }}
                onClick={() => setActivePartId(part.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                  <input type="checkbox" checked={part.visible} onChange={() => toggleVisibility(part.id)} style={{ marginRight: 8, cursor: 'pointer' }} />
                  <span style={{ fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>{part.name}</span>
                </div>
                <div style={{ display: 'flex' }}>
                  <DownloadButton part={part} />
                  <button onClick={(e) => { e.stopPropagation(); deletePart(part.id); }} style={{ marginLeft: 5, backgroundColor: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', padding: 0 }}>X</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {parts.length > 0 && activePartId && (
        <div style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: '15px' }}>
          <button 
            onClick={handleCut}
            disabled={processing}
            style={{ 
              padding: '12px 24px', fontSize: '1.2rem', backgroundColor: processing ? '#666' : '#cc0000', 
              color: 'white', border: 'none', borderRadius: 8, cursor: processing ? 'default' : 'pointer', fontWeight: 'bold'
            }}
          >
            {processing ? 'Beregner snitt...' : 'Kutt Aktiv Del'}
          </button>
        </div>
      )}

      {(loading || processing) && (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <h2 style={{ padding: '20px', backgroundColor: '#333', borderRadius: 8 }}>{loading ? "Laster modell..." : "Beregner matematisk snitt, vennligst vent..."}</h2>
        </div>
      )}

      {errorMsg && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: '#2b0000', border: '1px solid #ff4444', padding: '20px', borderRadius: 8, maxWidth: '80%', zIndex: 1000 }}>
          <h3 style={{ color: '#ff4444', marginTop: 0 }}>Feil Oppstod</h3>
          <pre style={{ whiteSpace: 'pre-wrap', backgroundColor: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 4, fontFamily: 'monospace', fontSize: 12, maxHeight: '300px', overflowY: 'auto' }}>{errorMsg}</pre>
          <button onClick={() => setErrorMsg(null)} style={{ marginTop: 15, padding: '8px 16px', backgroundColor: '#444', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Lukk</button>
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}

export default App;
