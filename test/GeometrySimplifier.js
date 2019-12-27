import * as THREE from '../build/three.module.js';


var GeometrySimplifier = function () {

    // publics
    this.source = null;
    this.box = new THREE.Box3();
    this.gridSize = null;
    this.segments = null;

    /**
     * Array<[faces]>: index -> vertexIndex
     */
    this.vertFaceArray = [];

    /**
     * Map<gridid, gridinfo>
     * eg. gridid: "0_2_1", gridinfo: { vertices: [], point: [] }
     */
    this.gridsmap = new Map();
    this.xcomp = 0;
    this.ycomp = 0;
    this.zcomp = 0;
    this.xsegs = 0;
    this.ysegs = 0;
    this.zsegs = 0;

    // privates
    let scope = this;
    let faces, vertices, uvs;
    let normalDiffThreshold = Math.cos(60 * Math.PI / 180);


    function parseGeometry() {

        if (scope.source instanceof THREE.Geometry) {

            faces = scope.source.faces.map(face => face.clone());
            vertices = scope.source.vertices.map(vert => vert.clone());
            uvs = scope.source.faceVertexUvs;

        } else if (scope.source instanceof THREE.BufferGeometry) {

            let source = new THREE.Geometry().fromBufferGeometry(scope.source);
            faces = source.faces.map(face => face.clone());
            vertices = source.vertices.map(vert => vert.clone());
            uvs = source.faceVertexUvs;

        } else {

            console.error("The geometry to be simplified is none of 'THREE.Geometry' and 'THREE.BufferGeometry' ");

        }

        scope.vertFaceArray = new Array(vertices.length);
        for (let i = 0, fl = faces.length; i < fl; i++) {

            let face = faces[i];
            face.degenerated = false;

            var vertFaceRelation = scope.vertFaceArray[face.a];
            if (!vertFaceRelation) {
                scope.vertFaceArray[face.a] = [{
                    f: face,   // the related face
                    i: "a"     // the face index
                }];
            } else {
                vertFaceRelation.push({ f: face, i: "a" });
            }

            vertFaceRelation = scope.vertFaceArray[face.b];
            if (!vertFaceRelation) {
                scope.vertFaceArray[face.b] = [{
                    f: face,   // the related face
                    i: "b"     // the face index
                }];
            } else {
                vertFaceRelation.push({ f: face, i: "b" });
            }

            vertFaceRelation = scope.vertFaceArray[face.c];
            if (!vertFaceRelation) {
                scope.vertFaceArray[face.c] = [{
                    f: face,   // the related face
                    i: "c"     // the face index
                }];
            } else {
                vertFaceRelation.push({ f: face, i: "c" });
            }
        }

    }


    function initGridsInfo() {
        scope.gridsmap = new Map();
        scope.source.computeBoundingBox();

        let size = new THREE.Vector3();
        let center = new THREE.Vector3();
        scope.source.boundingBox.getSize(size);
        scope.source.boundingBox.getCenter(center);

        scope.box = scope.source.boundingBox.clone();
        // scope.box = new THREE.Box3().setFromCenterAndSize(center, size);

        if (scope.gridSize) {
            // use gridSize first
            scope.xcomp = scope.gridSize;
            scope.ycomp = scope.gridSize;
            scope.zcomp = scope.gridSize;

            scope.xsegs = size.x / scope.gridSize;
            scope.ysegs = size.y / scope.gridSize;
            scope.zsegs = size.z / scope.gridSize;

        } else if (scope.segments) {
            // use segments
            scope.xcomp = size.x / scope.segments;
            scope.ycomp = size.y / scope.segments;
            scope.zcomp = size.z / scope.segments;

            scope.xsegs = scope.segments;
            scope.ysegs = scope.segments;
            scope.zsegs = scope.segments;
        }

        scope.box = new THREE.Box3().setFromCenterAndSize(center, size);

    }


    function computeVertexGrid(vertex) {
        let x = 0 | ((vertex.x - scope.box.min.x) / scope.xcomp);
        let y = 0 | ((vertex.y - scope.box.min.y) / scope.ycomp);
        let z = 0 | ((vertex.z - scope.box.min.z) / scope.zcomp);

        if (x >= scope.xsegs) x = scope.xsegs - 1;
        if (y >= scope.ysegs) y = scope.ysegs - 1;
        if (z >= scope.zsegs) z = scope.zsegs - 1;

        let gridid = `${x}_${y}_${z}`;
        vertex.gridid = gridid;

        let grid = scope.gridsmap.get(gridid);
        if (!!grid) {
            grid.vertices.push(vertex);
        } else {
            scope.gridsmap.set(gridid, {
                vertices: [vertex],
                point: null,
            });
        }
        return grid;
    }


    function computeGridAvgPoint(grid) {
        let sumx = 0;
        let sumy = 0;
        let sumz = 0;
        let n = grid.vertices.length;
        for (let i = 0; i < grid.vertices.length; i++) {
            sumx += grid.vertices[i].x;
            sumy += grid.vertices[i].y;
            sumz += grid.vertices[i].z;
        }
        grid.point = new THREE.Vector3(sumx / n, sumy / n, sumz / n);
    }


    function checkFaceDegen(face) {
        let a = vertices[face.a];
        let b = vertices[face.b];
        let c = vertices[face.c];
        if (a.gridid == b.gridid || a.gridid == c.gridid || b.gridid == c.gridid) {
            face.degenerated = true;
            return true;
        }
        return false;
    }


    function compareNormalDiffs(normDiffArray, face) {
        for (let i = 0, l = normDiffArray.length; i < l; i++) {
            let dot = normDiffArray[i].n.dot(face.normal);
            if (dot > normalDiffThreshold) {
                normDiffArray[i].f.push(face);
                normDiffArray[i].n = normDiffArray[i].n.add(face.normal);
                normDiffArray[i].n.normalize();
                return;
            }
        }
        // not found any faces that has similar normal value, add to list as new one
        normDiffArray.push({
            f: [face],
            n: face.normal.clone()
        });
    }


    function resortNewVertices(newGeom) {

    }


    this.simplify = function (geometry, params) {

        if (params.tolerance <= 0) {
            console.error("The tolerance must be greater than 0");
            return;
        }

        if (params.tolerance !== undefined) {
            // tolerance = gridSize * sqrt(3) / 2
            this.gridSize = Math.max(params.tolerance, 0.01) * 2 / 1.7320508075688772;

        } else if (params.segments !== undefined) {
            // if no tolerance given, use parameter segments
            this.segments = Math.max(params.segments, 2);
        }

        let normalJoinAngle = params.normalJoinAngle || 60;
        normalDiffThreshold = Math.cos(normalJoinAngle * Math.PI / 180);

        this.source = geometry;

        let newGeom = new THREE.Geometry();

        parseGeometry();

        initGridsInfo();

        // determine every vertex's box & check face's degeneration
        for (let i = 0, fl = faces.length; i < fl; i++) {
            let face = faces[i];

            // compute every vertex's box
            computeVertexGrid(vertices[face.a]);
            computeVertexGrid(vertices[face.b]);
            computeVertexGrid(vertices[face.c]);

            checkFaceDegen(face);
        }

        console.log("faces.length", faces.length)
        // let validFaces = faces.filter(f => !f.degenerated);

        // set every vertex to be the grid-point-value
        this.gridsmap.forEach((grid) => {
            if (grid.vertices.length > 0) {
                if (!grid.point) {
                    computeGridAvgPoint(grid);
                }
                // set rest of the vertices to be the grid's point
                for (let i = 0; i < grid.vertices.length; i++) {
                    grid.vertices[i].set(grid.point.x, grid.point.y, grid.point.z);
                }
            }
        });


        // filter out the valid vertices & set valid faces new index
        for (let i = 0, al = this.vertFaceArray.length; i < al; i++) {

            let faceArr = this.vertFaceArray[i];

            let vert = vertices[i];
            let findVertex = newGeom.vertices.find(v => v.gridid == vert.gridid);

            // if the grid's vertex has been added already, it is not needed to add again
            if (!findVertex) {
                // vertex not found, needs to add to vertices
                let index = newGeom.vertices.push(vert) - 1;
                // set the new face indices
                for (let i = 0; i < faceArr.length; i++) {
                    let faceObj = faceArr[i];
                    faceObj.f[faceObj.i] = index;
                }
            } else {
                // found same grid's vertex, no need to add vertex, just use the same index
                let index = newGeom.vertices.indexOf(findVertex);
                // set the new face indices
                for (let i = 0; i < faceArr.length; i++) {
                    let faceObj = faceArr[i];
                    faceObj.f[faceObj.i] = index;
                }
            }

        }

        // add new faces (which are not degenerated)
        for (let i = 0, fl = faces.length; i < fl; i++) {
            if (!faces[i].degenerated) {
                newGeom.faces.push(faces[i]);
            }
        }


        newGeom.computeBoundingBox();
        newGeom.computeFaceNormals();


        // to generate smooth normal on mesh, compare each vertex's face's normals
        // if one vertex has too much difference on face normals, duplicate it in vertices array
        for (let i = 0, vl = newGeom.vertices.length; i < vl; i++) {
            let vertex = newGeom.vertices[i];
            let filteredFaces = newGeom.faces.filter(f => f.a == i || f.b == i || f.c == i);
            let fl = filteredFaces.length;
            if (fl > 1) {
                let normDiffs = [{
                    f: [filteredFaces[0]],
                    n: filteredFaces[0].normal.clone()
                }];
                for (let j = 1; j < fl; j++) {
                    let anotherFace = filteredFaces[j];
                    compareNormalDiffs(normDiffs, anotherFace);
                }
                if (normDiffs.length > 1) {
                    for (let j = 1, l = normDiffs.length; j < l; j++) {
                        let ff = normDiffs[j].f;
                        // duplicate the vertex in array (insert after this vertex)
                        let newIndex = newGeom.vertices.push(vertex.clone()) - 1;
                        for (let k = 0, ffl = ff.length; k < ffl; k++) {
                            if (ff[k].a == i) ff[k].a = newIndex;
                            if (ff[k].b == i) ff[k].b = newIndex;
                            if (ff[k].c == i) ff[k].c = newIndex;
                        }

                    }
                }
            }

        }

        // sort the new vertices, to be gpu-friendly-order
        resortNewVertices(newGeom);

        newGeom.computeVertexNormals();

        return newGeom;
    }

}


export { GeometrySimplifier };

