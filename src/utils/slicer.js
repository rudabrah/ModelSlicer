import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Add BVH extension to Three.js BufferGeometry
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export async function sliceModel(geometry, toolsData, modelMatrixWorld) {
    // 1. Prepare the original model mesh
    let indexedGeometry = geometry;
    if (!indexedGeometry.index) {
        indexedGeometry = BufferGeometryUtils.mergeVertices(geometry, 1e-5);
    }
    indexedGeometry.computeVertexNormals();

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
    if (modelMatrixWorld) {
        modelBrush.applyMatrix4(modelMatrixWorld);
    }
    modelBrush.updateMatrixWorld();

    const evaluator = new Evaluator();
    evaluator.useGroups = false; 
    evaluator.attributes = ['position', 'normal'];

    // We will keep track of the "outside" (partA) and all "insides" (partsB)
    let currentPartA = modelBrush;
    const partsB = [];

    // 2. Perform CSG Operations for each tool
    for (const tool of toolsData) {
        let indexedToolGeometry = tool.geometry;
        if (!indexedToolGeometry.index) {
            indexedToolGeometry = BufferGeometryUtils.mergeVertices(tool.geometry, 1e-5);
        }
        indexedToolGeometry.computeVertexNormals();

        const pristineToolGeo = new THREE.BufferGeometry();
        pristineToolGeo.setAttribute('position', indexedToolGeometry.attributes.position.clone());
        pristineToolGeo.setAttribute('normal', indexedToolGeometry.attributes.normal.clone());
        pristineToolGeo.setIndex(indexedToolGeometry.index.clone());
        pristineToolGeo.computeBoundsTree();
        
        const toolBrush = new Brush(pristineToolGeo);
        if (tool.matrixWorld) {
            toolBrush.applyMatrix4(tool.matrixWorld);
        }
        toolBrush.updateMatrixWorld();

        // New Outside: subtract tool from current outside
        const nextPartA = evaluator.evaluate(currentPartA, toolBrush, SUBTRACTION);
        
        // New Inside: intersection of model with this tool
        const partB = evaluator.evaluate(modelBrush, toolBrush, INTERSECTION);
        
        currentPartA = nextPartA;
        partsB.push(partB.geometry);
    }

    // Center geometries
    currentPartA.geometry.center();
    partsB.forEach(g => g.center());

    return {
        partA: currentPartA.geometry,
        partsB: partsB
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
