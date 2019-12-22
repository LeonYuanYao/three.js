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
    this.boxlist = [];


    function updateBox() {
        scope.source.computeBoundingBox();
        scope.box = scope.source.boundingBox.clone();
    }


    function parseGeometry() {
        let index = scope.source.index;
        let vertices = scope.source.attributes.position;
        let normals = scope.source.attributes.normal;
        let uvs = scope.source.attributes.uv;

        if (!index) {
            // has no index in geometry
            let face;
            for (let i = 0; i < vertices.count; i++) {

                let vertex = new THREE.Vector3(vertices.array[i * 3 + 0], vertices.array[i * 3 + 1], vertices.array[i * 3 + 2]);
                let normal = new THREE.Vector3(normals.array[i * 3 + 0], normals.array[i * 3 + 1], normals.array[i * 3 + 2]);
                let uv = new THREE.Vector2(uvs.array[i * 2 + 0], uvs.array[i * 2 + 1]);

                if (i % 3 == 0) {
                    face = new Face(i + 0, i + 1, i + 2);
                    scope.facelist.push(face);
                }

                face.vertices.push(vertex);
                face.normals.push(normal);
                face.uvs.push(uv);
            }

        } else {
            // already has index

        }

        updateBox();
    }


    function splitBox(segments) {
        scope.boxlist.length = 0;
        let size = new THREE.Vector3();
        scope.box.getSize(size);
        let xsize = size.x / segments;
        let ysize = size.y / segments;
        let zsize = size.z / segments;
        let min = scope.box.min;
        for (let i = 0; i < segments; i++) {
            for (let j = 0; j < segments; j++) {
                for (let k = 0; k < segments; k++) {
                    let box = new THREE.Box3(
                        new THREE.Vector3(min.x + i * xsize, min.y + j * ysize, min.z + k * zsize),
                        new THREE.Vector3(min.x + (i + 1) * xsize, min.y + (j + 1) * ysize, min.z + (k + 1) * zsize)
                    );
                    box.id = `${i}_${j}_${k}`;
                    box.vertices = [];
                    box.point = null;
                    scope.boxlist.push(box);
                }
            }
        }
    }


    function computeVertexBox(vertex) {
        for (let i = 0; i < scope.boxlist.length; i++) {
            let box = scope.boxlist[i];
            if (box.containsPoint(vertex)) {
                vertex.box = box;
                box.vertices.push(vertex);
                return;
            }
        }
    }


    function computeBoxAvgPoint(box) {
        if (box.vertices.length == 0)
            return;

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


    function checkDegeneration(face) {
        let a = face.vertices[0];
        let b = face.vertices[1];
        let c = face.vertices[2];
        if (a.box == b.box || a.box == c.box || b.box == c.box) {
            // console.log("found degenerated face!")
            // console.log(a, b, c)
            return true;
        }
        return false;
    }


    this.simplify = function (geometry, params) {
        this.source = geometry;
        let segments = params.segments;
        let newGeom = new THREE.BufferGeometry();

        parseGeometry();

        splitBox(segments);

        // determine every vertex's box & check face's degeneration
        for (let i = 0; i < this.facelist.length; i++) {
            let face = this.facelist[i];

            // compute every vertex's box
            for (let j = 0; j < face.vertices.length; j++) {
                let vertex = face.vertices[j];
                computeVertexBox(vertex);
            }
        }

        var originFaces = this.facelist.length;
        console.log("facelist.length", originFaces)

        for (let i = 0; i < this.facelist.length; i++) {
            let face = this.facelist[i];
            // check if the face needs to be degenerated
            if (checkDegeneration(face)) {
                this.facelist.splice(this.facelist.indexOf(face), 1);
            }
        }

        console.log("facelist.length", this.facelist.length)
        alert(`Face reduced: ${originFaces - this.facelist.length}`);


        // set every vertex in box to be the adjusted-point-value
        for (let i = 0; i < this.boxlist.length; i++) {
            let box = this.boxlist[i];
            if (!box.point) {
                computeBoxAvgPoint(box);
            }

            for (let j = 0; j < box.vertices.length; j++) {
                box.vertices[j].set(box.point.x, box.point.y, box.point.z);
            }
        }


        if (!scope.source.index) {
            // no index in source geom

            let newVertices = new Float32Array(this.facelist.length * 3 * 3);
            let newNormals = new Float32Array(this.facelist.length * 3 * 3);
            let newUvs = new Float32Array(this.facelist.length * 3 * 3);

            for (let i = 0; i < this.facelist.length; i++) {
                let face = this.facelist[i];

                newVertices[i * 9 + 0] = face.vertices[0].x;
                newVertices[i * 9 + 1] = face.vertices[0].y;
                newVertices[i * 9 + 2] = face.vertices[0].z;
                newVertices[i * 9 + 3] = face.vertices[1].x;
                newVertices[i * 9 + 4] = face.vertices[1].y;
                newVertices[i * 9 + 5] = face.vertices[1].z;
                newVertices[i * 9 + 6] = face.vertices[2].x;
                newVertices[i * 9 + 7] = face.vertices[2].y;
                newVertices[i * 9 + 8] = face.vertices[2].z;

                newNormals[i * 9 + 0] = face.normals[0].x;
                newNormals[i * 9 + 1] = face.normals[0].y;
                newNormals[i * 9 + 2] = face.normals[0].z;
                newNormals[i * 9 + 3] = face.normals[1].x;
                newNormals[i * 9 + 4] = face.normals[1].y;
                newNormals[i * 9 + 5] = face.normals[1].z;
                newNormals[i * 9 + 6] = face.normals[2].x;
                newNormals[i * 9 + 7] = face.normals[2].y;
                newNormals[i * 9 + 8] = face.normals[2].z;

                newUvs[i * 6 + 0] = face.uvs[0].x;
                newUvs[i * 6 + 1] = face.uvs[0].y;
                newUvs[i * 6 + 2] = face.uvs[1].x;
                newUvs[i * 6 + 3] = face.uvs[1].y;
                newUvs[i * 6 + 4] = face.uvs[2].x;
                newUvs[i * 6 + 5] = face.uvs[2].y;
            }

            newGeom.setAttribute('position', new THREE.BufferAttribute(newVertices, 3));
            newGeom.setAttribute('normal', new THREE.BufferAttribute(newNormals, 3));
            newGeom.setAttribute('uv', new THREE.BufferAttribute(newUvs, 3));

            newGeom.computeFaceNormals();
            newGeom.computeBoundingBox();

        } else {

        }


        return newGeom;
    }

}


export { GeometrySimplifyUtil };

