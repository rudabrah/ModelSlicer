import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Add BVH extension to Three.js BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export async function sliceModel(geometry, toolGeometry, toolMatrixWorld, modelMatrixWorld) {
    // 1. Prepare the original model mesh
    let indexedGeometry = geometry;
    if (!indexedGeometry.index) {
        indexedGeometry = BufferGeometryUtils.mergeVertices(geometry, 1e-5);
    }
    indexedGeometry.computeVertexNormals();

    // Rebuild pristine geometry
    const pristineModelGeo = new THREE.BufferGeometry();
    pristineModelGeo.setAttribute('position', indexedGeometry.attributes.position.clone());
    pristineModelGeo.setAttribute('normal', indexedGeometry.attributes.normal.clone());
    if (indexedGeometry.index) {
        pristineModelGeo.setIndex(indexedGeometry.index.clone());
    } else {
        throw new Error("Kunne ikke indeksere geometrien, mangler index-array.");
    }
    pristineModelGeo.computeBoundsTree();

    const modelBrush = new Brush(pristineModelGeo);
    // Apply the world matrix from the scene if the object was moved
    if (modelMatrixWorld) {
        modelBrush.applyMatrix4(modelMatrixWorld);
    }
    modelBrush.updateMatrixWorld();

    // 2. Prepare the Tool Geometry (The cutter)
    // We expect toolGeometry to already be correctly formed (e.g. an ExtrudeGeo or BoxGeo)
    let indexedToolGeometry = toolGeometry;
    if (!indexedToolGeometry.index) {
        indexedToolGeometry = BufferGeometryUtils.mergeVertices(toolGeometry, 1e-5);
    }
    indexedToolGeometry.computeVertexNormals();

    const pristineToolGeo = new THREE.BufferGeometry();
    pristineToolGeo.setAttribute('position', indexedToolGeometry.attributes.position.clone());
    pristineToolGeo.setAttribute('normal', indexedToolGeometry.attributes.normal.clone());
    pristineToolGeo.setIndex(indexedToolGeometry.index.clone());
    pristineToolGeo.computeBoundsTree();
    
    const toolBrush = new Brush(pristineToolGeo);

    // Apply the exact user-defined transform for the cut volume
    if (toolMatrixWorld) {
        toolBrush.applyMatrix4(toolMatrixWorld);
    }
    toolBrush.updateMatrixWorld();

    // 3. Perform CSG Operations
    const evaluator = new Evaluator();
    evaluator.useGroups = false; 
    evaluator.attributes = ['position', 'normal'];

    // Part A: Subtract the box from the model (Keeps what is OUTSIDE the box)
    const partA = evaluator.evaluate(modelBrush, toolBrush, SUBTRACTION);
    
    // Part B: Intersect the box with the model (Keeps what is INSIDE the box)
    const partB = evaluator.evaluate(modelBrush, toolBrush, INTERSECTION);

    // Center geometries and optionally return to origin
    partA.geometry.center();
    partB.geometry.center();

    return {
        partA: partA.geometry,
        partB: partB.geometry
    };
}

export function downloadStl(stlString, filename) {
    const blob = new Blob([stlString], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
