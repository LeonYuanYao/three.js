import * as THREE from '../build/three.module.js';


var GeometrySimplifier = function () {

    // publics
    this.source = null;
    this.box = new THREE.Box3();
    this.segments;

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


    function initGridsInfo(segments) {
        scope.source.computeBoundingBox();
        scope.box = scope.source.boundingBox.clone();

        scope.gridsmap = new Map();
        let size = new THREE.Vector3();
        scope.box.getSize(size);
        scope.xcomp = size.x / segments;
        scope.ycomp = size.y / segments;
        scope.zcomp = size.z / segments;
    }


    function computeVertexGrid(vertex) {
        let x = 0 | ((vertex.x - scope.box.min.x) / scope.xcomp);
        let y = 0 | ((vertex.y - scope.box.min.y) / scope.ycomp);
        let z = 0 | ((vertex.z - scope.box.min.z) / scope.zcomp);

        if (x == scope.segments) x--;
        if (y == scope.segments) y--;
        if (z == scope.segments) z--;

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
        // not found any faces that has similar normal value, add to list new
        normDiffArray.push({
            f: [face], 
            n: face.normal
        });
    }


    this.simplify = function (geometry, params) {
        this.source = geometry;
        this.segments = params.segments;

        let newGeom = new THREE.Geometry();

        if (this.segments < 2) {
            console.error("The segments cannot be smaller than 2");
            return;
        }

        parseGeometry();

        initGridsInfo(this.segments);

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
            // checkVertexDegen(faceArr);

            let vert = vertices[i];
            let findVertex = newGeom.vertices.find(v => v.gridid == vert.gridid);

            // if the grid's vertex has been added already, it is not needed to add again
            if (!findVertex) {
                // vertex not found, needs to add to vertices
                newGeom.vertices.push(vert);
                let index = newGeom.vertices.indexOf(vert);
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

        // newGeom = new THREE.BufferGeometry().fromGeometry(newGeom)

        newGeom.computeBoundingBox();
        newGeom.computeFaceNormals();

        for (let i = 0, vl = newGeom.vertices.length; i < vl; i++) {
            let vertex = newGeom.vertices[i];
            let faces = newGeom.faces.filter(f => f.a == i || f.b == i || f.c == i);
            let fl = faces.length;
            if (fl > 1) {
                let normDiffs = [{
                    f: [faces[0]],
                    n: faces[0].normal
                }];
                for (let j = 1; j < fl; j++) {
                    let anotherFace = faces[j];
                    compareNormalDiffs(normDiffs, anotherFace);
                }
                if (normDiffs.length > 1) {
                    for (let j = 1, l = normDiffs.length; j < l; j++) {
                        let ff = normDiffs[j].f;
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


        newGeom.computeVertexNormals();


        // console.log(newGeom.faces.length)



        return newGeom;
    }

}


export { GeometrySimplifier };

