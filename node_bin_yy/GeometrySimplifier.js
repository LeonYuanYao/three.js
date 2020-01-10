import * as THREE from '../build/three.module.js';
// const THREE = require("../build/three");


/**
 * @constructor
 * 
 */
var DefaultSimplifier = function () {

    // publics
    this.name = "DefaultSimplifier";
    this.source = null;
    this.box = new THREE.Box3();
    this.gridSize = null;
    this.segments = null;
    this.recomputeNormal = false;
    this.preventNoFaces = false; // will generate a simple gemetry (boundingbox) for results without faces

    // privates
    let scope = this;

    let vertFaceArray = []; // Array<[FaceInfos]>: index -> vertexIndex

    // Map<gridid, GridInfo>
    // eg. gridid: "0_2_1", GridInfo: { vertices: [], point: [], uvs: [], newUVs: [] }
    let gridsmap = new Map();
    let xcomp = 0;
    let ycomp = 0;
    let zcomp = 0;
    let xsegs = 0;
    let ysegs = 0;
    let zsegs = 0;

    let gridNewIndexMap = new Map(); // Map<gridid, newIndex>

    let size, center, faces, vertices, uvsArr, hasUVs;
    let normalDiffThreshold = Math.cos(60 * Math.PI / 180);

    /**
     * printMsg
     *
     * @param {*} msg
     */
    function printMsg(msg) {
        console.log(scope.name + " - " + msg);
    }


    /**
     * parseGeometry
     *
     */
    function parseGeometry() {

        let source;
        if (scope.source instanceof THREE.Geometry) {

            source = scope.source;

        } else if (scope.source instanceof THREE.BufferGeometry) {

            source = new THREE.Geometry().fromBufferGeometry(scope.source);

        } else {

            console.error("The geometry to be simplified is neither 'THREE.Geometry' nor 'THREE.BufferGeometry' ");

        }

        faces = source.faces.map(face => face.clone());
        vertices = source.vertices.map(vert => vert.clone());
        uvsArr = source.faceVertexUvs;

        if (uvsArr.length > 0 && uvsArr[0].length > 0) {
            hasUVs = true;
        } else {
            hasUVs = false;
        }

        vertFaceArray = new Array(vertices.length);
        for (let i = 0, fl = faces.length; i < fl; i++) {

            let face = faces[i];
            face.degenerated = false;
            face.grids = { a: null, b: null, c: null };

            var vertFaceRelation = vertFaceArray[face.a];
            if (!vertFaceRelation) {
                vertFaceArray[face.a] = [new FaceInfo(face, "a")];
            } else {
                vertFaceRelation.push(new FaceInfo(face, "a"));
            }

            vertFaceRelation = vertFaceArray[face.b];
            if (!vertFaceRelation) {
                vertFaceArray[face.b] = [new FaceInfo(face, "b")];
            } else {
                vertFaceRelation.push(new FaceInfo(face, "b"));
            }

            vertFaceRelation = vertFaceArray[face.c];
            if (!vertFaceRelation) {
                vertFaceArray[face.c] = [new FaceInfo(face, "c")];
            } else {
                vertFaceRelation.push(new FaceInfo(face, "c"));
            }
        }

    }


    /**
     * initGridsInfo
     *
     */
    function initGridsInfo() {
        gridsmap = new Map();
        scope.source.computeBoundingBox();

        size = new THREE.Vector3();
        center = new THREE.Vector3();
        scope.source.boundingBox.getSize(size);
        scope.source.boundingBox.getCenter(center);

        scope.box = scope.source.boundingBox.clone();

        // prevent the gridSize to be larger than the bounding box
        // if (scope.gridSize > size.x && scope.gridSize > size.y && scope.gridSize > size.z) {
        //     scope.gridSize = Math.max(size.x, size.y, size.z) / 2;
        // }

        if (scope.gridSize) {
            // use gridSize first
            xcomp = Math.min(scope.gridSize, size.x); // prevent the component less than 2
            ycomp = Math.min(scope.gridSize, size.y); // the segments will be calculated by `Math.round`
            zcomp = Math.min(scope.gridSize, size.z); // if component == size, the grids will be least: 2x2x2

            xsegs = Math.round(size.x / xcomp);
            ysegs = Math.round(size.y / ycomp);
            zsegs = Math.round(size.z / zcomp);

        } else if (scope.segments) {
            // use segments
            xcomp = size.x / scope.segments;
            ycomp = size.y / scope.segments;
            zcomp = size.z / scope.segments;

            xsegs = scope.segments;
            ysegs = scope.segments;
            zsegs = scope.segments;
        }

        scope.box = new THREE.Box3().setFromCenterAndSize(center, size);

    }


    /**
     * computeGridid
     *
     * @param {*} vertex
     * @returns
     */
    function computeGridid(vertex) {
        let x = Math.round((vertex.x - scope.box.min.x) / xcomp);
        let y = Math.round((vertex.y - scope.box.min.y) / ycomp);
        let z = Math.round((vertex.z - scope.box.min.z) / zcomp);

        // prevent the vertex to be fitted in out-of-box grid (gridid is based on lower bound index)
        // if (x >= xsegs) x = xsegs - 1;
        // if (y >= ysegs) y = ysegs - 1;
        // if (z >= zsegs) z = zsegs - 1;

        // if (x <= 0) x = - 1;
        // if (y <= 0) y = - 1;
        // if (z <= 0) z = - 1;

        return `${x}_${y}_${z}`;
    }


    /**
     * computeVertexGrid
     *
     * @param {*} vertex
     * @returns
     */
    function computeVertexGrid(vertex) {

        let gridid = computeGridid(vertex);

        vertex.gridid = gridid;
        let grid = gridsmap.get(gridid);
        if (!!grid) {
            grid.vertices.push(vertex);
        } else {
            grid = new GridInfo([vertex]);
            gridsmap.set(gridid, grid);
        }
        return grid;
    }


    /**
     * addGridUV
     *
     * @param {*} grid
     * @param {*} faceIndex
     * @param {*} abc
     */
    function addGridUV(grid, faceIndex, abc) {
        for (let i = 0, uvl = uvsArr.length; i < uvl; i++) {
            let uvArr = uvsArr[i]; //[uvs]
            let faceUV = uvArr[faceIndex]; //[uv0, uv1, uv2]
            if (!grid.uvs[i]) grid.uvs[i] = [];
            if (abc == "a") grid.uvs[i].push(faceUV[0]);
            if (abc == "b") grid.uvs[i].push(faceUV[1]);
            if (abc == "c") grid.uvs[i].push(faceUV[2]);
        }
    }


    /**
     * computeGridAvgPoint
     *
     * @param {*} grid
     */
    function computeGridAvgPoint(grid) {
        let sumx = 0;
        let sumy = 0;
        let sumz = 0;
        let n = grid.vertices.length;
        for (let i = 0; i < n; i++) {
            sumx += grid.vertices[i].x;
            sumy += grid.vertices[i].y;
            sumz += grid.vertices[i].z;
        }
        return new THREE.Vector3(sumx / n, sumy / n, sumz / n);
    }


    /**
     * computeGridQuadricPoint
     *
     * @param {*} grid
     */
    function computeGridQuadricPoint(grid) {
        let q = new QuadricMatrix(0, 0, 0, 0);
        let n = grid.vertices.length;
        for (let i = 0; i < n; i++) {
            q.addInPlace(grid.vertices[i].q);
        }
        let det = q.det();

        // todo: fix, some vertex will be calculated wrong
        if (Math.abs(det) < 0.0000000001) {
            return computeGridAvgPoint(grid);
        } else {

            let m = new THREE.Matrix4();
            m.set(
                q.m[0], q.m[1], q.m[2], 0,
                q.m[1], q.m[4], q.m[5], 0,
                q.m[2], q.m[5], q.m[7], 0,
                q.m[3], q.m[6], q.m[8], 1
            );

            try {
                m = new THREE.Matrix4().getInverse(m, true);
                let e = m.elements;
                return new THREE.Vector3(e[3], e[7], e[11]);
            } catch (e) {
                return computeGridAvgPoint(grid);
            }
        }

    }


    /**
     * computeGridAvgUV
     *
     * @param {*} grid
     */
    function computeGridAvgUV(grid) {
        let newUVS = [];
        for (let i = 0, l = grid.uvs.length; i < l; i++) {
            let uvArr = grid.uvs[i];
            let sumx = 0;
            let sumy = 0;
            let n = uvArr.length;
            for (let j = 0; j < n; j++) {
                sumx += uvArr[j].x;
                sumy += uvArr[j].y;
            }
            newUVS[i] = new THREE.Vector2(sumx / n, sumy / n);
        }
        return newUVS;
    }


    /**
     *
     *
     * @param {*} grid
     * @returns
     */
    function computeGridMaxUV(grid) {
        let newUVS = [];
        for (let i = 0, l = grid.uvs.length; i < l; i++) {
            let uvArr = grid.uvs[i];
            let maxx = 0;
            let maxy = 0;
            let n = uvArr.length;
            for (let j = 0; j < n; j++) {
                maxx = Math.max(uvArr[j].x, maxx);
                maxy = Math.max(uvArr[j].y, maxy);
            }
            newUVs[i] = new THREE.Vector2(maxx, maxy);
        }
        return newUVS;
    }


    /**
     * checkFaceDegen
     *
     * @param {*} face
     * @returns
     */
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

    /**
     * compareNormalDiffs
     *
     * @param {*} normDiffArray
     * @param {*} face
     * @returns
     */
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


    /**
     * resortVerticesOrder
     *
     * @param {*} newGeom
     */
    function resortVerticesOrder(newGeom) {
        // find first vertex without gridid (duplicated)
        let dupIndexStart = newGeom.vertices.findIndex(v => v.gridid == undefined);
        let vl = newGeom.vertices.length;

        for (let i = dupIndexStart; i < vl; i++) {

            let vert = newGeom.vertices[i];
            // let findOriginFaces = newGeom.faces.find(f => f.a == i || f.b == i || f.c == i);

            let computedGridid = computeGridid(vert);
            let findOriginIndex = newGeom.vertices.findIndex(v => v.gridid == computedGridid);
            let newVertIndex = findOriginIndex + 1;

            // set the vertex to new index
            newGeom.vertices.splice(newVertIndex, 0, vert.clone());

            // remove the original vertex
            newGeom.vertices.splice(i + 1, 1);

            // set face's index to new value
            for (let j = 0, fl = newGeom.faces.length; j < fl; j++) {
                let face = newGeom.faces[j];

                if (face.a == i) {
                    face.a = newVertIndex;
                } else if (face.a > findOriginIndex && face.a < i) {
                    face.a++;
                }

                if (face.b == i) {
                    face.b = newVertIndex;
                } else if (face.b > findOriginIndex && face.b < i) {
                    face.b++;
                }

                if (face.c == i) {
                    face.c = newVertIndex;
                } else if (face.c > findOriginIndex && face.c < i) {
                    face.c++;
                }
            }
        }

    }


    /**
     * computeQuadricMatrix
     *
     * @param {*} vertex
     * @param {*} face
     */
    function computeQuadricMatrix(vertex, face) {
        let a = vertices[face.a];
        let b = vertices[face.b];
        let c = vertices[face.c];
        let plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
        let q = new QuadricMatrix(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        if (!!vertex.q) {
            vertex.q.addInPlace(q);
        } else {
            vertex.q = q;
        }
    }


    /**
     * generateSimpleGeometry
     *
     * @returns
     */
    function generateSimpleGeometry() {
        let geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
        geometry.vertices.forEach(v => v.add(center));
        return geometry;
    }


    /**
     * simplify(geometry, params) : THREE.Geometry
     *
     * @param {THREE.Geometry / THREE.BufferGeometry} geometry
     * @param {Object} params { segments: int(2, ~), errorThreshold: float(0, ~), normalJoinAngle: float(0-180) }
     * 
     * @returns {THREE.Geometry}
     */
    this.simplify = function (geometry, params) {

        if (params.errorThreshold <= 0) {
            console.error("The errorThreshold must be greater than 0");
            return;
        }

        if (params.segments !== undefined) {
            // if no errorThreshold given, use parameter segments
            this.segments = Math.max(params.segments, 2);
        } else if (params.errorThreshold !== undefined) {
            // errorThreshold = gridSize * sqrt(3) / 2
            this.gridSize = Math.max(params.errorThreshold, 0.001) * 2 / 1.7320508075688772;
        }

        this.recomputeNormal = params.recomputeNormal || false;
        this.preventNoFaces = params.preventNoFaces || false;


        let normalJoinAngle = params.normalJoinAngle || 60;
        normalDiffThreshold = Math.cos(normalJoinAngle * Math.PI / 180);

        this.source = geometry;

        let newGeom = new THREE.Geometry();

        printMsg("parseGeometry");
        parseGeometry();

        initGridsInfo();

        // determine every vertex's box & check face's degeneration
        printMsg("original face count: " + faces.length);
        for (let i = 0, fl = faces.length; i < fl; i++) {
            let face = faces[i];

            // compute every vertex's box
            let vertex, grid;

            vertex = vertices[face.a];
            // computeQuadricMatrix(vertex, face);
            grid = computeVertexGrid(vertex);
            if (hasUVs) addGridUV(grid, i, "a");

            vertex = vertices[face.b];
            // computeQuadricMatrix(vertex, face);
            grid = computeVertexGrid(vertex);
            if (hasUVs) addGridUV(grid, i, "b");

            vertex = vertices[face.c];
            // computeQuadricMatrix(vertex, face);
            grid = computeVertexGrid(vertex);
            if (hasUVs) addGridUV(grid, i, "c");

            checkFaceDegen(face);
        }
        printMsg("face grids done. ");

        // let validFaces = faces.filter(f => !f.degenerated);

        // set every vertex to be the grid-point-value
        printMsg("compute vertices");
        gridsmap.forEach((grid, id) => {
            if (grid.vertices.length > 0) {
                if (!grid.point) {
                    grid.point = computeGridAvgPoint(grid);
                    // console.log(id, grid.point);
                    // grid.point = computeGridQuadricPoint(grid);
                    // console.log(id, grid.point);
                }
                if (!grid.uv) {
                    grid.newUVs = computeGridAvgUV(grid);
                    // grid.newUVs = computeGridMaxUV(grid);
                }
                // set rest of the vertices to be the grid's point
                for (let i = 0; i < grid.vertices.length; i++) {
                    grid.vertices[i].set(grid.point.x, grid.point.y, grid.point.z);
                }
            }
        });


        // filter out the valid vertices & set valid faces new index
        printMsg("generate new vertices");
        for (let i = 0, al = vertFaceArray.length; i < al; i++) {

            let faceArr = vertFaceArray[i];

            // compatible for non-used vertex
            if (faceArr === undefined) continue;

            let vert = vertices[i];
            let findIndex = gridNewIndexMap.get(vert.gridid);

            // if the grid's vertex has been added already, it is not needed to add again
            if (!findIndex) {
                // vertex not found, needs to add to vertices
                let index = newGeom.vertices.push(vert) - 1;
                // set the new face indices
                for (let j = 0; j < faceArr.length; j++) {
                    let faceObj = faceArr[j];
                    faceObj.f[faceObj.i] = index;
                    faceObj.f.grids[faceObj.i] = vert.gridid;
                }
                // add this grid-index relation into the map
                gridNewIndexMap.set(vert.gridid, index);
            } else {
                // found same grid's vertex, no need to add vertex, just use the same index
                // set the new face indices
                for (let j = 0; j < faceArr.length; j++) {
                    let faceObj = faceArr[j];
                    faceObj.f[faceObj.i] = findIndex;
                    faceObj.f.grids[faceObj.i] = vert.gridid;
                }
            }

        }

        // add new faces (which are not degenerated)
        printMsg("generate new faces");
        for (let i = 0, fl = faces.length; i < fl; i++) {
            let face = faces[i];
            if (!face.degenerated) {
                newGeom.faces.push(face);
                // set new uvs
                if (hasUVs) {
                    for (let j = 0, uvl = uvsArr.length; j < uvl; j++) {
                        let uv0 = gridsmap.get(face.grids.a).newUVs[j];
                        let uv1 = gridsmap.get(face.grids.b).newUVs[j];
                        let uv2 = gridsmap.get(face.grids.c).newUVs[j];
                        newGeom.faceVertexUvs[j].push([uv0, uv1, uv2]);
                    }
                }
            }
        }

        // todo: if no faces generated
        if (newGeom.faces.length == 0 && this.preventNoFaces) {
            newGeom = generateSimpleGeometry();
        }


        // recompute normal
        if (this.recomputeNormal) {
            printMsg("compute face normals");
            newGeom.computeFaceNormals();

            printMsg("recalculating normals");
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

            printMsg("compute vertex normals");
            newGeom.computeVertexNormals();
        }

        // re-sort the new vertices, to be gpu friendly order. RESULT NOT AS EXPECTED. 
        // resortVerticesOrder(newGeom);

        newGeom.computeBoundingBox();
        printMsg("new face count: " + newGeom.faces.length);

        // release memory
        this.source = null;
        this.box = new THREE.Box3();
        this.gridSize = null;
        this.segments = null;
        this.recomputeNormal = false;
        this.preventNoFaces = false;
        vertFaceArray = []; 
        gridsmap = new Map();
        xcomp = 0;
        ycomp = 0;
        zcomp = 0;
        xsegs = 0;
        ysegs = 0;
        zsegs = 0;
        gridNewIndexMap = new Map();
        size = null; center = null; faces = null; vertices = null; uvsArr = null; hasUVs = null;
        normalDiffThreshold = Math.cos(60 * Math.PI / 180);

        return newGeom;
    }

}



/**
 * @constructor
 *
 */
var QuadricSimplifier = function () {

    // publics
    this.source = null;

    // privates
    let scope = this;
    let faces, vertices, uvsArr, hasUVs;
    let edgesMap = new Map(); //Map<edge, Object>, Ojbect { vertices, faces }
    let vertFaceArray = []; //Array<[faces]>: index -> vertexIndex
    let vertQMatArray = [];


    function genEdgeInfo(face, i1, i2, vertices) {
        let edge1 = [face[i1], face[i2]];
        let edge2 = [face[i2], face[i1]];

        let getEdge1 = edgesMap.get(edge1);
        if (!!getEdge1) {

            getEdge1.faces.push(face);

        } else {

            let getEdge2 = edgesMap.get(edge2);

            if (!!getEdge2) {

                getEdge2.faces.push(face);

            } else {

                edgesMap.set(edge1, {
                    vertices: [vertices[face[i1]], vertices[face[i2]]],
                    faces: [face]
                });
            }
        }
    }


    function parseGeometry() {

        let source;

        if (scope.source instanceof THREE.Geometry) {

            source = scope.source;

        } else if (scope.source instanceof THREE.BufferGeometry) {

            source = new THREE.Geometry().fromBufferGeometry(scope.source);

        } else {

            console.error("The geometry to be simplified is neither 'THREE.Geometry' nor 'THREE.BufferGeometry' ");

        }

        faces = source.faces.map(face => face.clone());
        vertices = source.vertices.map(vert => vert.clone());
        uvsArr = source.faceVertexUvs;

        if (uvsArr.length > 0 && uvsArr[0].length > 0) {
            hasUVs = true;
        } else {
            hasUVs = false;
        }

        for (let i = 0, fl = faces.length; i < fl; i++) {
            let face = faces[i];
            face.degenerated = false;

            genEdgeInfo(face, "a", "b", vertices);
            genEdgeInfo(face, "a", "c", vertices);
            genEdgeInfo(face, "b", "c", vertices);

            // generate vertFaceArray info
            var vertFaceRelation = vertFaceArray[face.a];
            if (!vertFaceRelation) {
                vertFaceArray[face.a] = [{
                    f: face,   // the related face
                    i: "a"     // the face index
                }];
            } else {
                vertFaceRelation.push({ f: face, i: "a" });
            }

            vertFaceRelation = vertFaceArray[face.b];
            if (!vertFaceRelation) {
                vertFaceArray[face.b] = [{
                    f: face,   // the related face
                    i: "b"     // the face index
                }];
            } else {
                vertFaceRelation.push({ f: face, i: "b" });
            }

            vertFaceRelation = vertFaceArray[face.c];
            if (!vertFaceRelation) {
                vertFaceArray[face.c] = [{
                    f: face,   // the related face
                    i: "c"     // the face index
                }];
            } else {
                vertFaceRelation.push({ f: face, i: "c" });
            }
        }

    }


    function computeQuadricMatrix(face, vertices) {
        let a = vertices[face.a];
        let b = vertices[face.b];
        let c = vertices[face.c];
        let plane = new THREE.Plane().setFromCoplanarPoints(a, b, c);
        return new QuadricMatrix(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    }


    this.simplify = function (geometry, params) {
        this.source = geometry;

        parseGeometry();

        // calculate QMatrix for every vertex
        for (let i = 0, vl = vertFaceArray.length; i < vl; i++) {
            let faceArr = vertFaceArray[i];
            let vertQMat = null;
            for (let j = 0, fl = faceArr.length; j < fl; j++) {
                let faceObj = faceArr[j];
                if (vertQMat == null) {
                    vertQMat = computeQuadricMatrix(faceObj.f, vertices);
                } else {
                    vertQMat.addInPlace(computeQuadricMatrix(faceObj.f, vertices));
                }
            }

        }

    }


}


/**
 * Class FaceInfo
 *
 * @param {*} face
 * @param {*} i
 */
function FaceInfo(face, i) {
    if (!face || !i) console.error("FaceInfo should have face & i properties. ");
    this.f = face; // eg. THREE.Face3
    this.i = i; // eg. "a" / "b" / "c"
}


/**
 * Class GridInfo
 *
 * @param {*} vertices
 */
function GridInfo(vertices, uvs) {
    this.vertices = vertices || [];
    this.uvs = uvs || [];
    this.point = null;
    this.newUVs = [];
}


/**
 * Class QuadricMatrix
 *
 * @param {*} a
 * @param {*} b
 * @param {*} c
 * @param {*} d
 */
function QuadricMatrix(a, b, c, d) {
    // basic 10 elements of Quadric Matrix
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;

    this.m = [
        a * a, a * b, a * c, a * d, // 0, 1, 2, 3
        b * b, b * c, b * d,        //    4, 5, 6
        c * c, c * d,               //       7, 8
        d * d                       //          9
    ];

    // this.matrix = new THREE.Matrix4().set(
    //     a * a, a * b, a * c, a * d,
    //     a * b, b * b, b * c, b * d,
    //     a * c, b * c, c * c, c * d,
    //     a * d, b * d, c * d, d * d
    // );
}
Object.assign(QuadricMatrix.prototype, {

    addInPlace: function (anotherQM) {
        for (let i = 0; i < 10; i++) {
            this.m[i] += anotherQM.m[i];
        }
        return this;
    },

    det: function () {
        var te = this.m;

        var n11 = te[0], n12 = te[1], n13 = te[2], n14 = te[3];
        var n21 = te[1], n22 = te[4], n23 = te[5], n24 = te[6];
        var n31 = te[2], n32 = te[5], n33 = te[7], n34 = te[8];
        var n41 = te[3], n42 = te[6], n43 = te[8], n44 = te[9];

        return (
            n41 * (
                + n14 * n23 * n32
                - n13 * n24 * n32
                - n14 * n22 * n33
                + n12 * n24 * n33
                + n13 * n22 * n34
                - n12 * n23 * n34
            ) +
            n42 * (
                + n11 * n23 * n34
                - n11 * n24 * n33
                + n14 * n21 * n33
                - n13 * n21 * n34
                + n13 * n24 * n31
                - n14 * n23 * n31
            ) +
            n43 * (
                + n11 * n24 * n32
                - n11 * n22 * n34
                - n14 * n21 * n32
                + n12 * n21 * n34
                + n14 * n22 * n31
                - n12 * n24 * n31
            ) +
            n44 * (
                - n13 * n22 * n31
                - n11 * n23 * n32
                + n11 * n22 * n33
                + n13 * n21 * n32
                - n12 * n21 * n33
                + n12 * n23 * n31
            )
        );
    },

    matrix: function () {
        let m = this.m;
        return new THREE.Matrix4().set(
            m[0], m[1], m[2], m[3],
            m[1], m[4], m[5], m[6],
            m[2], m[5], m[7], m[8],
            m[3], m[6], m[8], m[9]
        );
    },

    clone: function () {
        return new QuadricMatrix(this.a, this.b, this.c, this.d);
    }

});






export { DefaultSimplifier, QuadricSimplifier };

