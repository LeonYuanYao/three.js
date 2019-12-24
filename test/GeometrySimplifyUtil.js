import * as THREE from '../build/three.module.js';

var Face = function (index1, index2, index3, v1, v2, v3, n1, n2, n3, uv1, uv2, uv3) {

    let scope = this;

    this.degenerated = false;

    this.index1 = index1;
    this.index2 = index2;
    this.index3 = index3;

    this.vertices = [];
    if (!!v1 && !!v2 && !!v3) {
        this.vertices[0] = v1;
        this.vertices[1] = v2;
        this.vertices[2] = v3;
    }

    this.normals = [];
    if (!!n1 && !!n2 && !!n3) {
        this.normals[0] = n1;
        this.normals[1] = n2;
        this.normals[2] = n3;
    }

    this.uvs = [];
    if (!!uv1 && !!uv2 && !!uv3) {
        this.uvs[0] = uv1;
        this.uvs[1] = uv2;
        this.uvs[2] = uv3;
    }

    this.setVertices = function (v1, v2, v3) {
        this.vertices[0] = v1;
        this.vertices[1] = v2;
        this.vertices[2] = v3;
    }

    this.setNormals = function (n1, n2, n3) {
        this.normals[0] = n1;
        this.normals[1] = n2;
        this.normals[2] = n3;
    }

    this.setUvs = function (uv1, uv2, uv3) {
        this.uvs[0] = uv1;
        this.uvs[1] = uv2;
        this.uvs[2] = uv3;
    }

    this.hasNormals = function () {
        return this.normals.length > 0;
    }

    this.hasUvs = function () {
        return this.uvs.length > 0;
    }

}


// 

var GeometrySimplifyUtil = function () {

    let scope = this;

    this.source = null;
    this.newGeom = new THREE.Geometry();
    this.box = new THREE.Box3();
    this.facelist = [];

    /**
     * Map <boxid, box>
     * eg. boxid: "0_2_1", box: { vertices: [], point: [] }
     */
    this.boxmap = new Map();
    this.xcomp = 0;
    this.ycomp = 0;
    this.zcomp = 0;


    function updateBox() {
        scope.source.computeBoundingBox();
        scope.box = scope.source.boundingBox.clone();
    }


    function parseGeometry() {

        let faces, vertices, uvs;

        if (scope.source instanceof THREE.Geometry) {

            faces = scope.source.faces;
            vertices = scope.source.vertices;
            uvs = scope.source.faceVertexUvs;

        } else if (scope.source instanceof THREE.BufferGeometry) {

            scope.source = new THREE.Geometry().fromBufferGeometry(scope.source);
            faces = scope.source.faces;
            vertices = scope.source.vertices;
            uvs = scope.source.faceVertexUvs;

        } else {

            throw ("The geometry to be simplified is none of 'THREE.Geometry' or 'THREE.BufferGeometry'. ");

        }


        let newFace;
        for (let i = 0; i < faces.length; i++) {

            let face = faces[i];

            newFace = new Face(face.a, face.b, face.c);
            scope.facelist.push(face);

            newFace.setVertices(vertices[face.a].clone(), vertices[face.b].clone(), vertices[face.c].clone());
            
            if (uvs.length > 0){
                newFace.setUvs()
            }


            let vertex = new THREE.Vector3(vertices.array[i * 3 + 0], vertices.array[i * 3 + 1], vertices.array[i * 3 + 2]);
            let normal = new THREE.Vector3(normals.array[i * 3 + 0], normals.array[i * 3 + 1], normals.array[i * 3 + 2]);
            let uv = new THREE.Vector2(uvs.array[i * 2 + 0], uvs.array[i * 2 + 1]);

            face.vertices.push(vertex);
            face.normals.push(normal);
            face.uvs.push(uv);
        }



        updateBox();
    }


    function initBoxInfo(segments) {
        scope.boxmap = new Map();
        let size = new THREE.Vector3();
        scope.box.getSize(size);
        scope.xcomp = size.x / segments;
        scope.ycomp = size.y / segments;
        scope.zcomp = size.z / segments;
    }


    function computeVertexBox(vertex) {
        let x = parseInt((vertex.x - scope.box.min.x) / scope.xcomp);
        let y = parseInt((vertex.y - scope.box.min.y) / scope.ycomp);
        let z = parseInt((vertex.z - scope.box.min.z) / scope.zcomp);
        let boxid = `${x}_${y}_${z}`;
        vertex.boxid = boxid;

        if (scope.boxmap.has(boxid)) {
            scope.boxmap.get(boxid).vertices.push(vertex);
        } else {
            scope.boxmap.set(boxid, {
                vertices: [vertex],
                point: null,
            });
        }
    }


    function computeBoxAvgPoint(box) {
        let sumx = 0;
        let sumy = 0;
        let sumz = 0;
        let n = box.vertices.length;
        box.vertices.forEach(v => {
            sumx += v.x;
            sumy += v.y;
            sumz += v.z;
        });

        box.point = new THREE.Vector3(sumx / n, sumy / n, sumz / n);
    }


    function checkFaceDegen(face) {
        let a = face.vertices[0];
        let b = face.vertices[1];
        let c = face.vertices[2];
        if (a.boxid == b.boxid || a.boxid == c.boxid || b.boxid == c.boxid) {
            face.degenerated = true;
            return true;
        }
        return false;
    }


    this.simplify = function (geometry, params) {
        this.source = geometry;
        let segments = params.segments;
        let newBufGeom = new THREE.BufferGeometry();

        if (segments < 2) {
            console.error("The param.segments cannot be smaller than 2");
            return;
        }

        parseGeometry();

        initBoxInfo(segments);

        // determine every vertex's box & check face's degeneration
        for (let i = 0; i < this.facelist.length; i++) {
            let face = this.facelist[i];

            // compute every vertex's box
            for (let j = 0; j < face.vertices.length; j++) {
                let vertex = face.vertices[j];
                computeVertexBox(vertex);
            }

            checkFaceDegen(face);
        }

        console.log("facelist.length", this.facelist.length)
        this.facelist = this.facelist.filter(f => !f.degenerated);
        console.log("facelist.length", this.facelist.length)

        // set every vertex to be the box-point-value
        scope.boxmap.forEach((box) => {
            if (!box.point) {
                computeBoxAvgPoint(box);
            }

            for (let i = 0; i < box.vertices.length; i++) {
                box.vertices[i].set(box.point.x, box.point.y, box.point.z);
            }
        });

        if (!scope.source.index) {
            // no index in source geom
            let newVertices = new Float32Array(this.facelist.length * 3 * 3);
            // let newNormals = new Float32Array(this.facelist.length * 3 * 3);
            // let newUvs = new Float32Array(this.facelist.length * 3 * 3);

            for (let i = 0; i < this.facelist.length; i++) {
                let face = this.facelist[i];

                if (face.degenerated) {
                    continue; // skip when face needs degenerate
                }

                newVertices[i * 9 + 0] = face.vertices[0].x;
                newVertices[i * 9 + 1] = face.vertices[0].y;
                newVertices[i * 9 + 2] = face.vertices[0].z;
                newVertices[i * 9 + 3] = face.vertices[1].x;
                newVertices[i * 9 + 4] = face.vertices[1].y;
                newVertices[i * 9 + 5] = face.vertices[1].z;
                newVertices[i * 9 + 6] = face.vertices[2].x;
                newVertices[i * 9 + 7] = face.vertices[2].y;
                newVertices[i * 9 + 8] = face.vertices[2].z;

                // newNormals[i * 9 + 0] = face.normals[0].x;
                // newNormals[i * 9 + 1] = face.normals[0].y;
                // newNormals[i * 9 + 2] = face.normals[0].z;
                // newNormals[i * 9 + 3] = face.normals[1].x;
                // newNormals[i * 9 + 4] = face.normals[1].y;
                // newNormals[i * 9 + 5] = face.normals[1].z;
                // newNormals[i * 9 + 6] = face.normals[2].x;
                // newNormals[i * 9 + 7] = face.normals[2].y;
                // newNormals[i * 9 + 8] = face.normals[2].z;

                // newUvs[i * 6 + 0] = face.uvs[0].x;
                // newUvs[i * 6 + 1] = face.uvs[0].y;
                // newUvs[i * 6 + 2] = face.uvs[1].x;
                // newUvs[i * 6 + 3] = face.uvs[1].y;
                // newUvs[i * 6 + 4] = face.uvs[2].x;
                // newUvs[i * 6 + 5] = face.uvs[2].y;

            }

            newBufGeom.setAttribute('position', new THREE.BufferAttribute(newVertices, 3));
            // newGeom.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
            // newGeom.setAttribute('uv', new THREE.BufferAttribute(newUvs, 3));

            var newGeom = new THREE.Geometry();
            newGeom.fromBufferGeometry(newBufGeom);

            newGeom.computeVertexNormals();
            newGeom.computeBoundingBox();

        } else {
            // has index

        }


        return newGeom;
    }

}


export { GeometrySimplifyUtil };

