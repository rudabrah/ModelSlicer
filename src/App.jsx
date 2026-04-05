import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, GizmoHelper, GizmoViewport, TrackballControls } from '@react-three/drei';
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
  handleReset = () => {
    window.location.reload();
  };
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

function Scene({ parts, activePartId, mode, orbitEnabled, setOrbitEnabled, partRefs, controlTarget, setControlTarget, edgePoints, activePointId, setActivePointId, setEdgePoints, controlsRef, snapMode, setSnapMode, cuttingTools, setCuttingTools, activeToolId, setActiveToolId, toolRefs, extrudeGeometry, orderedVertices }) {
  const { scene } = useThree();
  const pointRefs = useRef({});
  const planes = useMemo(() => Array.from({length: 6}, () => new THREE.Plane()), []);

  // Update highlighting planes to roughly encompass the tool
  useFrame(() => {
    const currentBox = toolRefs.current[activeToolId];
    if (currentBox && parts.length > 0) {
      currentBox.updateMatrixWorld();
      const m = currentBox.matrixWorld;
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


  const lineGeometry = useMemo(() => {
     const points3D = orderedVertices.map(v => new THREE.Vector3(v.x, v.y, 0));
     return new THREE.BufferGeometry().setFromPoints(points3D);
  }, [orderedVertices]);


  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
      <axesHelper args={[100]} />
      <Grid infiniteGrid fadeDistance={500} sectionColor="#444" cellColor="#222" />
      {/* Free 360-degree rotation without "poles" */}
      <TrackballControls ref={controlsRef} makeDefault rotateSpeed={4.0} zoomSpeed={1.2} panSpeed={0.8} staticMoving={true} />

      {parts.filter(p => p.visible).map((part) => (
        <group 
           key={part.id}
           ref={(el) => { if (el) partRefs.current[part.id] = el; }}
           position={part.position}
           quaternion={part.quaternion}
           scale={part.scale}
        >
           <mesh 
             geometry={part.geometry}
             onPointerDown={(e) => {
               if (snapMode && toolRefs.current[activeToolId]) {
                 e.stopPropagation();
                 const normal = e.face.normal.clone();
                 // Normal is in local space, transform it to world space
                 const normalMatrix = new THREE.Matrix3().getNormalMatrix(e.object.matrixWorld);
                 normal.applyMatrix3(normalMatrix).normalize();
                 
                 // Intersection point in world space
                 const point = e.point;
                 
                 // Align box:
                 // We want the box's "cut axis" (Z) to point along the normal
                 const up = new THREE.Vector3(0, 1, 0);
                 if (Math.abs(normal.dot(up)) > 0.99) up.set(1, 0, 0); // Avoid gimbal lock
                 
                 const lookAtMatrix = new THREE.Matrix4().lookAt(
                   new THREE.Vector3(0, 0, 0),
                   normal,
                   up
                 );
                 
                 const activeTool = toolRefs.current[activeToolId];
                 activeTool.position.copy(point);
                 activeTool.quaternion.setFromRotationMatrix(lookAtMatrix);
                 
                 setSnapMode(false); // Turn off after use
                 setControlTarget('boks');
               }
             }}
           >
             <meshStandardMaterial 
               color={part.id === activePartId ? (snapMode ? "#ff00ff" : "#886600") : (snapMode ? "#ffccff" : "#aaaaaa")} 
               roughness={0.4} 
               metalness={0.1} 
               side={THREE.DoubleSide} 
               opacity={snapMode ? 0.9 : 1.0}
               transparent={snapMode}
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

      {/* Render All Cutting Tools */}
      {cuttingTools.map((tool) => (
        <group 
          key={tool.id} 
          ref={(el) => { if (el) toolRefs.current[tool.id] = el; }}
          position={tool.position}
          rotation={tool.rotation}
          scale={tool.scale}
          onPointerDown={(e) => {
             e.stopPropagation();
             setActiveToolId(tool.id);
             setControlTarget('boks');
          }}
        >
           {/* Visual Volume of the Tool */}
           <mesh name="toolMesh" geometry={tool.type === 'shape' ? extrudeGeometry : undefined}>
              {tool.type === 'box' && <boxGeometry args={[1, 1, 1]} />}
              <meshStandardMaterial 
                color={tool.id === activeToolId ? (tool.type === 'shape' ? "#00ffff" : "#00ffcc") : "#008888"} 
                transparent 
                opacity={tool.id === activeToolId ? 0.4 : 0.2} 
                depthWrite={false}
                side={THREE.DoubleSide}
              />
           </mesh>

           {/* Special visualization for Shape tool */}
           {tool.type === 'shape' && tool.id === activeToolId && (
              <>
                 <mesh position={[0, 0, 0.5]}>
                    <lineLoop geometry={lineGeometry}>
                       <lineBasicMaterial color="#ffffff" linewidth={2} depthTest={false} transparent opacity={0.8} />
                    </lineLoop>
                 </mesh>
                 {Object.entries(edgePoints).map(([side, points]) => (
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
              </>
           )}
        </group>
      ))}

      {/* Global Transform Controls for ACTIVE Tool (outside loop for stability) */}
      {controlTarget === 'boks' && toolRefs.current[activeToolId] && (
         <TransformControls 
           key={activeToolId}
           object={toolRefs.current[activeToolId]} 
           mode={mode}
           rotationSnap={Math.PI / 12}
           translationSnap={1}
           onMouseDown={() => setOrbitEnabled(false)}
           onMouseUp={() => setOrbitEnabled(true)}
         />
      )}

      {/* Part Control */}

      {/* Part Control */}
      {parts.length > 0 && activePartId && controlTarget === 'part' && partRefs.current[activePartId] && (
        <TransformControls
          object={partRefs.current[activePartId]}
          mode={mode}
          rotationSnap={Math.PI / 12}
          translationSnap={1}
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
      {/* Visual orientation gizmo in the corner */}
      <GizmoHelper
        alignment="bottom-right"
        margin={[80, 80]}
      >
        <GizmoViewport axisColors={['#ff4444', '#44ff44', '#4444ff']} labelColor="white" />
      </GizmoHelper>
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
  const [snapMode, setSnapMode] = useState(false);

  const [cuttingTools, setCuttingTools] = useState([
    { id: 'tool-0', type: 'box', position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 10, 10] }
  ]);
  const [activeToolId, setActiveToolId] = useState('tool-0');

  const toolRefs = useRef({});
  const boxRef = { current: toolRefs.current[activeToolId] }; // Compatibility shim for existing logic

  const partRefs = useRef({});
  const controlsRef = useRef();

  // Robust state management for the keyboard listener (avoiding stale closures)
  const stateRef = useRef({ parts, activePartId, controlTarget, processing });
  useEffect(() => {
    stateRef.current = { parts, activePartId, controlTarget, processing };
  }, [parts, activePartId, controlTarget, processing]);

  const [edgePoints, setEdgePoints] = useState({
     top: [],
     bottom: [],
     left: [],
     right: []
  });
  const [activePointId, setActivePointId] = useState(null);
  const [history, setHistory] = useState([]);

  const orderedVertices = useMemo(() => {
    // Collect all points in order
    const pts = [];
    // Top side: Left to right
    edgePoints.top.forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
    // Right side: Top to bottom
    edgePoints.right.forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
    // Bottom side: Right to left
    [...edgePoints.bottom].reverse().forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));
    // Left side: Bottom to top
    [...edgePoints.left].reverse().forEach(p => pts.push(new THREE.Vector2(p.x, p.y)));

    // Ensure we don't have duplicate sequential points (can break Shape)
    const uniquePts = [];
    pts.forEach((p, i) => {
       if (i === 0) {
          uniquePts.push(p);
       } else {
          const prev = uniquePts[uniquePts.length - 1];
          if (p.distanceTo(prev) > 0.001) {
             uniquePts.push(p);
          }
       }
    });
    return uniquePts;
  }, [edgePoints]);

  const extrudeGeometry = useMemo(() => {
     if (orderedVertices.length < 3) return new THREE.BoxGeometry(1,1,1);
     const shape = new THREE.Shape(orderedVertices);
     const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 1,
        bevelEnabled: false,
     });
     geo.translate(0, 0, -0.5);
     return geo;
  }, [orderedVertices]);

  const pushToHistory = useCallback(() => {
    setHistory(prev => {
      // Clone geometries to preserve them in history
      const entry = {
        parts: parts.map(p => ({ ...p, geometry: p.geometry.clone() })),
        edgePoints: JSON.parse(JSON.stringify(edgePoints)),
        activePartId: activePartId
      };
      const newHistory = [...prev, entry];
      if (newHistory.length > 5) {
          // Dispose of the oldest geometry to save memory
          const oldest = newHistory.shift();
          oldest.parts.forEach(p => p.geometry.dispose());
      }
      return newHistory;
    });
  }, [parts, edgePoints, activePartId]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    
    // Dispose current parts before restoring
    parts.forEach(p => p.geometry.dispose());

    setParts(last.parts);
    setEdgePoints(last.edgePoints);
    setActivePartId(last.activePartId);
    setHistory(prev => prev.slice(0, -1));
  }, [history, parts]);

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
      // Use current values from the ref to ensure logic always uses latest state
      const { parts: currentParts, activePartId: currentActiveId, controlTarget: currentTarget, processing: currentlyProcessing } = stateRef.current;
      
      // Also ignore if we are typing in an input (if any)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.ctrlKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undo();
          return;
      }

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

      // --- Arrow Key Navigation ---
      const moveStep = e.ctrlKey ? 0.1 : 1.0;
      const rotateStep = Math.PI / 12; // 15 degrees
      
      const isArrowKey = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(e.key);
      if (isArrowKey) {
          e.preventDefault();
          
          if (currentTarget === 'boks') {
              const currentBox = toolRefs.current[stateRef.current.activeToolId];
              if (currentBox) {
                  if (e.shiftKey) {
                      if (e.key === 'ArrowLeft') currentBox.rotation.y += rotateStep;
                      if (e.key === 'ArrowRight') currentBox.rotation.y -= rotateStep;
                      if (e.key === 'ArrowUp') currentBox.rotation.x -= rotateStep;
                      if (e.key === 'ArrowDown') currentBox.rotation.x += rotateStep;
                  } else {
                      if (e.key === 'ArrowLeft') currentBox.position.x -= moveStep;
                      if (e.key === 'ArrowRight') currentBox.position.x += moveStep;
                      if (e.key === 'ArrowUp') currentBox.position.z -= moveStep;
                      if (e.key === 'ArrowDown') currentBox.position.z += moveStep;
                      if (e.key === 'PageUp') currentBox.position.y += moveStep;
                      if (e.key === 'PageDown') currentBox.position.y -= moveStep;
                  }
              }
          } else if (currentTarget === 'part' && currentActiveId) {
              setParts(prev => prev.map(p => {
                  if (p.id !== currentActiveId) return p;
                  const pos = [...p.position];
                  const quat = new THREE.Quaternion(...p.quaternion);
                  const eul = new THREE.Euler().setFromQuaternion(quat);

                  if (e.shiftKey) {
                      if (e.key === 'ArrowLeft') eul.y += rotateStep;
                      if (e.key === 'ArrowRight') eul.y -= rotateStep;
                      if (e.key === 'ArrowUp') eul.x -= rotateStep;
                      if (e.key === 'ArrowDown') eul.x += rotateStep;
                      quat.setFromEuler(eul);
                      return { ...p, quaternion: quat.toArray() };
                  } else {
                      if (e.key === 'ArrowLeft') pos[0] -= moveStep;
                      if (e.key === 'ArrowRight') pos[0] += moveStep;
                      if (e.key === 'ArrowUp') pos[2] -= moveStep;
                      if (e.key === 'ArrowDown') pos[2] += moveStep;
                      if (e.key === 'PageUp') pos[1] += moveStep;
                      if (e.key === 'PageDown') pos[1] -= moveStep;
                      return { ...p, position: pos };
                  }
              }));
          } else if (currentTarget === 'shape') {
              // Optionally handle arrow keys for direct point movement here? 
              // Usually mouse is better for points.
          } else {
              // --- Fallback: Camera Movement (if no target is active) ---
              if (controlsRef.current) {
                  const cam = controlsRef.current.object;
                  const rotateOrbit = (angle) => {
                      const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                      cam.position.applyQuaternion(quat);
                      cam.lookAt(0, 0, 0); 
                      controlsRef.current.update();
                  };
                  
                  if (e.key === 'ArrowLeft') rotateOrbit(0.1);
                  if (e.key === 'ArrowRight') rotateOrbit(-0.1);
                  if (e.key === 'ArrowUp') {
                      cam.position.y += moveStep * 5;
                      cam.lookAt(0, 0, 0);
                      controlsRef.current.update();
                  }
                  if (e.key === 'ArrowDown') {
                      cam.position.y -= moveStep * 5;
                      cam.lookAt(0, 0, 0);
                      controlsRef.current.update();
                  }
              }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // Attached only once!

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }, []);
  const handleDragOver = useCallback((e) => { e.preventDefault(); }, []);

  const loadFile = (file) => {
    pushToHistory();
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
            setEdgePoints({ top: [], bottom: [], left: [] , right: [] });
            setActivePointId(null);
            
            // Set initial reasonable scale for the cutting box
            if (boxRef.current) {
                boxRef.current.scale.set(25, 25, 25);
                boxRef.current.position.set(0, 0, 0);
                boxRef.current.quaternion.set(0, 0, 0, 1);
            }
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
    pushToHistory();
    setParts(prev => prev.filter(p => p.id !== partId));
    if (activePartId === partId) setActivePartId(null);
  };

  const handleCut = () => {
    if (!activePartId || !boxRef.current) return;
    
    pushToHistory();
    setProcessing(true);
    setErrorMsg(null);
    const targetPart = parts.find(p => p.id === activePartId);

    setTimeout(async () => {
      try {
        const activeMesh = partRefs.current[activePartId];
        activeMesh.updateMatrixWorld(true);
        boxRef.current.updateMatrixWorld(true);

        const { sliceModel } = await import('./utils/slicer');
        
        // Build toolsData array from all cutting tools in the scene
        const toolsData = cuttingTools.map(tool => {
           const mesh = toolRefs.current[tool.id];
           if (!mesh) return null;
           
           let geometry = mesh.getObjectByName("toolMesh").geometry;
           if (tool.type === 'shape') {
              geometry = extrudeGeometry;
           }

           return { 
              geometry: geometry, 
              matrixWorld: mesh.matrixWorld.clone() 
           };
        }).filter(t => t !== null);

        const { partA, partsB } = await sliceModel(targetPart.geometry, toolsData, activeMesh.matrixWorld);
        
        const partPos = [0, 0, 0];
        const partQuat = [0, 0, 0, 1];
        const partScale = [1, 1, 1];

        const id1 = Date.now().toString() + "_a";
        const newPartA = {
          id: id1,
          name: `${targetPart.name}_utside`,
          geometry: partA,
          visible: true,
          position: partPos,
          quaternion: partQuat,
          scale: partScale
        };
        
        const newPartsB = partsB.map((geo, idx) => ({
          id: `${id1}_b_${idx}`,
          name: `${targetPart.name}_del_${idx + 1}`,
          geometry: geo,
          visible: true,
          position: partPos,
          quaternion: partQuat,
          scale: partScale
        }));

        setParts(prev => {
          const filtered = prev.filter(item => item.id !== activePartId);
          return [...filtered, newPartA, ...newPartsB];
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
      <Canvas 
        camera={{ position: [50, 50, 100], fov: 45, near: 0.1, far: 5000 }} 
        gl={{ localClippingEnabled: true }}
        onWheel={(e) => {
          if (e.altKey && stateRef.current.activePartId) {
             // Stop the camera from zooming while we are scaling
             e.stopPropagation();
             e.nativeEvent.preventDefault(); 
             
             const scaleDir = e.deltaY > 0 ? 0.9 : 1.1;
             if (controlTarget === 'boks' && boxRef.current) {
                boxRef.current.scale.multiplyScalar(scaleDir);
             } else if (controlTarget === 'part') {
                setParts(prev => prev.map(p => {
                   if (p.id !== activePartId) return p;
                   const newScale = p.scale.map(s => s * scaleDir);
                   return { ...p, scale: newScale };
                }));
             }
          }
        }}
      >
        <Scene 
          parts={parts}
          activePartId={activePartId}
          mode={mode}
          orbitEnabled={orbitEnabled}
          setOrbitEnabled={setOrbitEnabled}
          partRefs={partRefs}
          controlTarget={controlTarget}
          setControlTarget={setControlTarget}
          edgePoints={edgePoints}
          activePointId={activePointId}
          setActivePointId={setActivePointId}
          setEdgePoints={setEdgePoints}
          controlsRef={controlsRef}
          snapMode={snapMode}
          setSnapMode={setSnapMode}
          cuttingTools={cuttingTools}
          setCuttingTools={setCuttingTools}
          activeToolId={activeToolId}
          setActiveToolId={setActiveToolId}
          toolRefs={toolRefs}
          extrudeGeometry={extrudeGeometry}
          orderedVertices={orderedVertices}
        />
      </Canvas>

      <div style={{ position: 'absolute', top: 20, left: 20, backgroundColor: 'rgba(0,0,0,0.7)', padding: '15px', borderRadius: 8, pointerEvents: 'none', border: '1px solid #444', transition: 'all 0.3s ease' }}>
        <h1 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#00ffcc' }}>ModelSlicer</h1>
        
        <div style={{ marginBottom: 15 }}>
           <p style={{ margin: '5px 0', fontSize: '0.9rem', fontWeight: 'bold', color: '#00ff66' }}>
              [T] Verktøy: {controlTarget === 'boks' ? 'Styrer Kutteboks' : controlTarget === 'part' ? 'Flytter Modell' : 'Tegn Snitt'}
           </p>
           <p style={{ margin: '2px 0', fontSize: '0.8rem', opacity: 0.7 }}>Aktiv Verktøy: {activeToolId}</p>
           
           {/* Tool Type Selector */}
           <div style={{ display: 'flex', gap: '5px', marginTop: '10px' }}>
              <button 
                onClick={() => {
                   setCuttingTools(prev => prev.map(t => t.id === activeToolId ? { ...t, type: 'box' } : t));
                }} 
                style={{ 
                   flex: 1, padding: '5px', fontSize: '0.7rem', cursor: 'pointer', pointerEvents: 'auto',
                   backgroundColor: cuttingTools.find(t => t.id === activeToolId)?.type === 'box' ? '#00ffcc' : '#333',
                   color: cuttingTools.find(t => t.id === activeToolId)?.type === 'box' ? '#000' : '#fff'
                }}
              >
                Standard Boks
              </button>
              <button 
                onClick={() => {
                   setCuttingTools(prev => prev.map(t => t.id === activeToolId ? { ...t, type: 'shape' } : t));
                }} 
                style={{ 
                   flex: 1, padding: '5px', fontSize: '0.7rem', cursor: 'pointer', pointerEvents: 'auto',
                   backgroundColor: cuttingTools.find(t => t.id === activeToolId)?.type === 'shape' ? '#00ffff' : '#333',
                   color: cuttingTools.find(t => t.id === activeToolId)?.type === 'shape' ? '#000' : '#fff'
                }}
              >
                Tilpasset Snitt
              </button>
           </div>

           <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
              <button 
                onClick={() => {
                   const newId = `tool-${Date.now()}`;
                   setCuttingTools(prev => [...prev, { id: newId, type: 'box', position: [0, 0, 0], rotation: [0, 0, 0], scale: [10, 10, 10] }]);
                   setActiveToolId(newId);
                   setControlTarget('boks');
                }} 
                style={{ flex: 1, padding: '5px', fontSize: '0.7rem', cursor: 'pointer', pointerEvents: 'auto' }}
              >
                + Ny Boks
              </button>
              <button 
                onClick={() => {
                   if (cuttingTools.length <= 1) return;
                   const filtered = cuttingTools.filter(t => t.id !== activeToolId);
                   setCuttingTools(filtered);
                   setActiveToolId(filtered[0].id);
                }} 
                style={{ flex: 1, padding: '5px', fontSize: '0.7rem', cursor: 'pointer', pointerEvents: 'auto' }}
              >
                - Fjern Aktiv
              </button>
           </div>
        </div>

        <div style={{ padding: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 4 }}>
           <h4 style={{ margin: '0 0 5px 0', fontSize: '0.8rem', textTransform: 'uppercase', opacity: 0.5 }}>Kontroller:</h4>
           <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 10px', fontSize: '0.8rem' }}>
              <span style={{ color: '#00ffcc', fontWeight: 'bold' }}>Klikk boks:</span> <span>Velg boks i scenen</span>
              <span style={{ color: '#00ffcc', fontWeight: 'bold' }}>W / E / R:</span> <span>Flytt / Roter / Skaler boks</span>
              <span style={{ color: '#00ffcc', fontWeight: 'bold' }}>Pil/Shift:</span> <span>Flytt/Roter valgt boks</span>
              <span style={{ color: '#00ffcc', fontWeight: 'bold' }}>[T]:</span> <span>Bytt Fokus (Boks / Modell / Snitt)</span>
           </div>
        </div>

         <button 
            onClick={() => setSnapMode(!snapMode)}
            style={{ 
              marginTop: 15, 
              width: '100%', 
              padding: '10px', 
              cursor: 'pointer', 
              backgroundColor: snapMode ? '#ff00ff' : '#222', 
              color: 'white', 
              border: '1px solid #ff00ff', 
              borderRadius: 4, 
              fontWeight: 'bold',
              pointerEvents: 'auto'
            }}
         >
            🎯 {snapMode ? 'Klikk på fjes nå!' : 'Aktiver Snap to Face'}
         </button>

         <button 
            onClick={() => controlsRef.current?.reset()}
            style={{ 
              marginTop: 10, 
              width: '100%', 
              padding: '10px', 
              cursor: 'pointer', 
              backgroundColor: '#333', 
              color: '#ccc', 
              border: '1px solid #555', 
              borderRadius: 4, 
              fontSize: '0.8rem', 
              pointerEvents: 'auto' 
            }}
         >
            🔄 Nullstill Kamera
         </button>

        {parts.length === 0 && (
          <p style={{ margin: '15px 0 0 0', opacity: 0.8, fontSize: '0.9rem', borderTop: '1px solid #333', paddingTop: '10px' }}>
            💡 Dra og slipp en .STL eller .3MF fil her for å starte
          </p>
        )}

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
          {history.length > 0 && (
             <button 
               onClick={undo}
               style={{ 
                 padding: '12px 24px', fontSize: '1.2rem', backgroundColor: '#444', 
                 color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold'
               }}
             >
               Angre
             </button>
          )}
          <button 
            onClick={handleCut}
            disabled={processing}
            style={{ 
              padding: '12px 24px', fontSize: '1.2rem', backgroundColor: processing ? '#633' : '#cc0000', 
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
