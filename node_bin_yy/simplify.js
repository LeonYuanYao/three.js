const fs = require("fs");
const path = require("path");
const THREE = require("../build/three");
const ObjLoader = require("./OBJLoader");
const GeometrySimplifier = require("./GeometrySimplifier");

let objBuffer = fs.readFileSync(path.resolve("test/models/cup.obj"));
let objStr = objBuffer.toString();
let objLoader = new THREE.OBJLoader();
let group = objLoader.parse(objStr);
let geomSimplifier = new THREE.GeometrySimplifier();

group.children.forEach(mesh => {
    let newGeom = geomSimplifier.simplify(mesh.geometry, {
        segments: 10, 
        normalJoinAngle: 75
    });
    mesh.geometry = newGeom;
});

console.log("read")
